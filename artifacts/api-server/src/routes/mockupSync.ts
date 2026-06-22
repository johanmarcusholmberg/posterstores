import { Router } from "express";
import { db } from "@workspace/db";
import {
  mockupTemplatesTable,
  posterMockupsTable,
  postersTable,
} from "@workspace/db";
import { eq, and, inArray, isNull, or, isNotNull } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { compositePosterIntoTemplate } from "../lib/mockupCompositor";
import { ObjectStorageService } from "../lib/objectStorage";
import { randomUUID } from "crypto";

const router = Router();
const storage = new ObjectStorageService();

interface SyncResult {
  posterId: number;
  posterTitle: string;
  templateId: number;
  templateName: string;
  action: "generated" | "skipped" | "failed";
  reason?: string;
  mockupId?: number;
  imageUrl?: string;
}

interface SyncBody {
  storeKey: string;
  scope: "all" | "missing" | "selected";
  posterIds?: number[];
  templateIds?: number[];
  overwrite?: boolean;
  dryRun?: boolean;
}

router.post(
  "/admin/mockup-sync",
  adminLimiter,
  requireAdmin,
  async (req, res) => {
    const body = req.body as SyncBody;
    const { storeKey, scope, posterIds, templateIds, overwrite = false, dryRun = false } = body;

    if (!storeKey || typeof storeKey !== "string") {
      return res.status(400).json({ error: "storeKey is required" });
    }
    if (!["all", "missing", "selected"].includes(scope)) {
      return res.status(400).json({ error: "scope must be 'all', 'missing', or 'selected'" });
    }

    // ── 1. Load posters ──────────────────────────────────────────────────────
    let posterQuery = db
      .select()
      .from(postersTable)
      .where(eq(postersTable.storeKey, storeKey));

    const allPosters = await posterQuery;

    let targetPosters = allPosters.filter((p) => p.status === "published");

    if (scope === "selected") {
      if (!posterIds || posterIds.length === 0) {
        return res.status(400).json({ error: "posterIds required when scope is 'selected'" });
      }
      targetPosters = targetPosters.filter((p) => posterIds.includes(p.id));
    }

    if (targetPosters.length === 0) {
      return res.json({ generated: 0, skipped: 0, failed: 0, results: [] });
    }

    // ── 2. Load active templates ─────────────────────────────────────────────
    const templateRows = await db
      .select()
      .from(mockupTemplatesTable)
      .where(
        and(
          eq(mockupTemplatesTable.active, true),
          or(
            isNull(mockupTemplatesTable.storeKey),
            eq(mockupTemplatesTable.storeKey, storeKey)
          )
        )
      );

    let targetTemplates = templateRows.filter(
      (t) => t.posterX != null && t.posterY != null && t.posterWidth != null && t.posterHeight != null && t.backgroundImageUrl != null
    );

    if (templateIds && templateIds.length > 0) {
      targetTemplates = targetTemplates.filter((t) => templateIds.includes(t.id));
    }

    if (targetTemplates.length === 0) {
      return res.json({ generated: 0, skipped: 0, failed: 0, results: [], note: "No active templates with placement data and background image found." });
    }

    // ── 3. Load existing poster_mockups for these posters ────────────────────
    const posterIdsTarget = targetPosters.map((p) => p.id);
    const existingMockups = await db
      .select()
      .from(posterMockupsTable)
      .where(
        and(
          inArray(posterMockupsTable.posterId, posterIdsTarget),
          isNotNull(posterMockupsTable.mockupTemplateId)
        )
      );

    const existingSet = new Set(
      existingMockups.map((m) => `${m.posterId}:${m.mockupTemplateId}`)
    );

    // ── 4. Build work plan ───────────────────────────────────────────────────
    const results: SyncResult[] = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const poster of targetPosters) {
      for (const template of targetTemplates) {
        const pairKey = `${poster.id}:${template.id}`;
        const alreadyExists = existingSet.has(pairKey);

        if (alreadyExists && !overwrite) {
          if (scope === "missing" || !overwrite) {
            skipped++;
            results.push({
              posterId: poster.id,
              posterTitle: poster.title,
              templateId: template.id,
              templateName: template.name,
              action: "skipped",
              reason: "Mockup already exists (use overwrite to regenerate)",
            });
            continue;
          }
        }

        if (dryRun) {
          generated++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "generated",
            reason: "dry-run — not actually generated",
          });
          continue;
        }

        // Skip if poster has no image
        if (!poster.imageUrl) {
          failed++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "failed",
            reason: "Poster has no imageUrl",
          });
          continue;
        }

        try {
          const composited = await compositePosterIntoTemplate(
            template.backgroundImageUrl!,
            poster.imageUrl,
            {
              posterX: template.posterX!,
              posterY: template.posterY!,
              posterWidth: template.posterWidth!,
              posterHeight: template.posterHeight!,
              rotation: template.rotation,
              fitMode: template.fitMode,
              borderRadius: template.borderRadius,
              brightness: template.brightness,
              contrast: template.contrast,
              saturation: template.saturation,
            }
          );

          const subPath = `mockup-composites/${storeKey}/${poster.id}/${template.id}-${randomUUID().slice(0, 8)}.jpg`;
          const objectPath = await storage.uploadBuffer(subPath, composited, "image/jpeg");
          const imageUrl = `/api/storage${objectPath}`;

          const now = new Date();

          if (alreadyExists && overwrite) {
            // Update the existing record
            const existing = existingMockups.find(
              (m) => m.posterId === poster.id && m.mockupTemplateId === template.id
            );
            if (existing) {
              await db
                .update(posterMockupsTable)
                .set({
                  mockupImageUrl: imageUrl,
                  status: "generated",
                  generatedAt: now,
                  errorMessage: null,
                  updatedAt: now,
                })
                .where(eq(posterMockupsTable.id, existing.id));

              generated++;
              results.push({
                posterId: poster.id,
                posterTitle: poster.title,
                templateId: template.id,
                templateName: template.name,
                action: "generated",
                mockupId: existing.id,
                imageUrl,
              });
              continue;
            }
          }

          // Check if any primary mockup exists
          const hasPrimary = existingMockups.some(
            (m) => m.posterId === poster.id && m.isPrimary
          );

          const isPrimary = template.canBePrimary && !hasPrimary;
          const isHover = template.canBeHover && !existingMockups.some(
            (m) => m.posterId === poster.id && m.isHoverMockup
          );
          const isGallery = template.canBeGallery;

          const [inserted] = await db
            .insert(posterMockupsTable)
            .values({
              posterId: poster.id,
              mockupTemplateId: template.id,
              mockupImageUrl: imageUrl,
              sortOrder: existingMockups.filter((m) => m.posterId === poster.id).length,
              isPrimary,
              isHoverMockup: isHover,
              isGallery,
              status: "generated",
              generatedAt: now,
            })
            .onConflictDoUpdate({
              target: [posterMockupsTable.posterId, posterMockupsTable.mockupTemplateId],
              set: {
                mockupImageUrl: imageUrl,
                status: "generated",
                generatedAt: now,
                errorMessage: null,
                updatedAt: now,
              },
            })
            .returning();

          existingSet.add(pairKey);

          generated++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "generated",
            mockupId: inserted.id,
            imageUrl,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          req.log.error({ err, posterId: poster.id, templateId: template.id }, "Sync compositing failed");

          // Record failure in DB if entry exists
          const existing = existingMockups.find(
            (m) => m.posterId === poster.id && m.mockupTemplateId === template.id
          );

          if (!existing) {
            try {
              await db.insert(posterMockupsTable).values({
                posterId: poster.id,
                mockupTemplateId: template.id,
                mockupImageUrl: null,
                sortOrder: 0,
                isPrimary: false,
                isHoverMockup: false,
                isGallery: template.canBeGallery,
                status: "failed",
                errorMessage: msg,
              }).onConflictDoNothing();
            } catch {}
          } else {
            await db.update(posterMockupsTable)
              .set({ status: "failed", errorMessage: msg, updatedAt: new Date() })
              .where(eq(posterMockupsTable.id, existing.id));
          }

          failed++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "failed",
            reason: msg,
          });
        }
      }
    }

    return res.json({
      generated,
      skipped,
      failed,
      dryRun,
      results,
    });
  }
);

export default router;
