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
import { resolveEffectiveMockupPlacement } from "../lib/mockupPlacementAnalyzer";
import { randomUUID } from "crypto";

const router = Router();
const storage = new ObjectStorageService();

/** Maximum poster × template combinations allowed per non-dry-run request. */
const SYNC_HARD_LIMIT = 100;

/**
 * If the old imageUrl is a generated mockup-composite stored in our object
 * storage, extract the sub-path and delete it.  We only touch URLs that
 * match the expected `/api/storage/objects/mockup-composites/` prefix so
 * manually-uploaded assets and external URLs are never affected.
 */
async function tryDeleteOldComposite(
  imageUrl: string | null | undefined,
  log: { warn: (obj: object, msg: string) => void }
): Promise<void> {
  const GENERATED_PREFIX = "/api/storage/objects/mockup-composites/";
  if (!imageUrl || !imageUrl.startsWith(GENERATED_PREFIX)) return;
  const subPath = imageUrl.slice("/api/storage/objects/".length); // "mockup-composites/…"
  try {
    await storage.deleteObject(subPath);
  } catch (err) {
    log.warn({ err, subPath }, "Failed to delete old composite from storage (non-fatal)");
  }
}

interface SyncResult {
  posterId: number;
  posterTitle: string;
  templateId: number;
  templateName: string;
  action: "generated" | "skipped" | "failed";
  reason?: string;
  mockupId?: number;
  imageUrl?: string;
  placementSource?: "auto_detected" | "manual";
  placementWarnings?: string[];
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

    // A template is compositable if it has a background image AND effective placement.
    // Effective placement can come from auto_detected config OR manual posterX/Y/Width/Height.
    let targetTemplates = templateRows.filter((t) => {
      if (!t.backgroundImageUrl) return false;
      const { placementSource, posterX, posterY, posterWidth, posterHeight } = resolveEffectiveMockupPlacement(t);
      if (placementSource === "auto_detected") return true;
      // manual: must have all four placement values
      return posterX != null && posterY != null && posterWidth != null && posterHeight != null;
    });

    if (templateIds && templateIds.length > 0) {
      targetTemplates = targetTemplates.filter((t) => templateIds.includes(t.id));
    }

    if (targetTemplates.length === 0) {
      return res.json({ generated: 0, skipped: 0, failed: 0, plannedCount: 0, results: [], note: "No active templates with placement data and background image found." });
    }

    // ── 3. Safety-limit check ────────────────────────────────────────────────
    const plannedCount = targetPosters.length * targetTemplates.length;
    if (!dryRun && plannedCount > SYNC_HARD_LIMIT) {
      return res.status(400).json({
        error: `Sync would generate ${plannedCount} combinations (${targetPosters.length} poster${targetPosters.length !== 1 ? "s" : ""} × ${targetTemplates.length} template${targetTemplates.length !== 1 ? "s" : ""}), which exceeds the safe limit of ${SYNC_HARD_LIMIT} per request. Reduce the number of posters or templates, or run multiple smaller syncs.`,
        plannedCount,
        limit: SYNC_HARD_LIMIT,
      });
    }

    // ── 4. Load existing poster_mockups for these posters ────────────────────
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

    // Track which posters already have a primary / hover assigned (pre-existing
    // or just generated this run) so we never assign two primaries/hovers to
    // the same poster within a single sync pass.
    const assignedPrimary = new Set(
      existingMockups.filter((m) => m.isPrimary).map((m) => m.posterId)
    );
    const assignedHover = new Set(
      existingMockups.filter((m) => m.isHoverMockup).map((m) => m.posterId)
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

        // Resolve effective placement for this template
        const effective = resolveEffectiveMockupPlacement(template);
        const { posterX, posterY, posterWidth, posterHeight, rotation, placementSource, warnings: placementWarnings } = effective;

        if (dryRun) {
          generated++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "generated",
            reason: `dry-run — not actually generated (placement: ${placementSource})`,
            placementSource,
            placementWarnings,
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

        // Skip if effective placement is null
        if (posterX == null || posterY == null || posterWidth == null || posterHeight == null) {
          failed++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "failed",
            reason: `Template has no valid placement (mode: ${placementSource})`,
          });
          continue;
        }

        try {
          const composited = await compositePosterIntoTemplate(
            template.backgroundImageUrl!,
            poster.imageUrl,
            {
              posterX,
              posterY,
              posterWidth,
              posterHeight,
              rotation,
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
              // Delete the old generated composite from storage before overwriting
              await tryDeleteOldComposite(existing.mockupImageUrl, req.log);

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
                placementSource,
                placementWarnings,
              });
              continue;
            }
          }

          // Use running sets (not stale snapshot) to decide primary/hover
          // so we never assign two primaries or two hovers to the same poster
          // within a single sync pass.
          const isPrimary = template.canBePrimary && !assignedPrimary.has(poster.id);
          const isHover = template.canBeHover && !assignedHover.has(poster.id);
          const isGallery = template.canBeGallery;

          // Plain insert — we already know this pair is new (alreadyExists is
          // false). onConflictDoNothing guards against the rare case of a
          // parallel sync running simultaneously (avoids partial-index issues).
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
            .onConflictDoNothing()
            .returning();

          if (!inserted) {
            // Parallel sync race — treat as skipped
            skipped++;
            results.push({
              posterId: poster.id,
              posterTitle: poster.title,
              templateId: template.id,
              templateName: template.name,
              action: "skipped",
              reason: "Conflict — pair was already inserted by a concurrent sync",
            });
            continue;
          }

          existingSet.add(pairKey);
          if (isPrimary) assignedPrimary.add(poster.id);
          if (isHover) assignedHover.add(poster.id);

          generated++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "generated",
            mockupId: inserted.id,
            imageUrl,
            placementSource,
            placementWarnings,
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
      plannedCount,
      dryRun,
      results,
    });
  }
);

export default router;
