import { Router } from "express";
import { db } from "@workspace/db";
import {
  mockupTemplatesTable,
  posterMockupsTable,
  postersTable,
} from "@workspace/db";
import { eq, and, inArray, isNull, isNotNull } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { renderMockup, type RenderSurface } from "../lib/mockupCompositor";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  resolveEffectiveMockupSurface,
  getSurfaceSourceLabel,
  type SurfaceSource,
} from "../lib/mockupSurfaceResolver";
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
 *
 * This must be called AFTER the database has been updated with the new URL —
 * if it fails, we log a warning and continue (non-fatal).
 */
async function tryDeleteOldComposite(
  imageUrl: string | null | undefined,
  log: { warn: (obj: object, msg: string) => void }
): Promise<void> {
  const GENERATED_PREFIX = "/api/storage/objects/mockup-composites/";
  if (!imageUrl || !imageUrl.startsWith(GENERATED_PREFIX)) return;
  const subPath = imageUrl.slice("/api/storage/objects/".length);
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
  placementSource?: "manual";
  placementWarnings?: string[];
  surfaceSource?: SurfaceSource;
  surfaceWarning?: string;
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

    // ── 1. Build filter conditions for existing poster_mockup rows ────────────
    //
    // Sync ONLY operates on existing poster_mockup rows — it never creates new
    // rows for poster/template pairs that have not been explicitly selected by
    // the admin. Creating new poster_mockup associations is a separate action.

    const filterConditions = [
      isNotNull(posterMockupsTable.mockupTemplateId),
    ];

    if (scope === "missing") {
      filterConditions.push(isNull(posterMockupsTable.mockupImageUrl));
    }

    if (scope === "selected") {
      if (posterIds && posterIds.length > 0) {
        filterConditions.push(inArray(posterMockupsTable.posterId, posterIds));
      }
      if (templateIds && templateIds.length > 0) {
        filterConditions.push(inArray(posterMockupsTable.mockupTemplateId, templateIds));
      }
    } else if (templateIds && templateIds.length > 0) {
      filterConditions.push(inArray(posterMockupsTable.mockupTemplateId, templateIds));
    }

    // ── 2. Fetch rows with poster + template ──────────────────────────────────
    const mockupRows = await db
      .select({
        mockup: posterMockupsTable,
        poster: postersTable,
        template: mockupTemplatesTable,
      })
      .from(posterMockupsTable)
      .innerJoin(postersTable, and(
        eq(posterMockupsTable.posterId, postersTable.id),
        eq(postersTable.storeKey, storeKey),
        eq(postersTable.status, "published"),
      ))
      .innerJoin(mockupTemplatesTable, eq(posterMockupsTable.mockupTemplateId, mockupTemplatesTable.id))
      .where(and(...filterConditions));

    if (mockupRows.length === 0) {
      const hint = scope === "selected"
        ? "No matching poster × template combinations found for the given selection."
        : scope === "missing"
        ? "All published poster × template combinations already have images."
        : "No poster × template combinations found for this store.";
      return res.json({
        generated: 0,
        skipped: 0,
        failed: 0,
        plannedCount: 0,
        dryRun,
        results: [],
        note: hint + " Sync only updates mockups that have already been selected for a poster.",
      });
    }

    // ── 3. Filter eligible rows ───────────────────────────────────────────────
    const eligibleRows = mockupRows.filter(({ template, mockup }) => {
      if (!template.backgroundImageUrl) return false;
      const surface = resolveEffectiveMockupSurface(template);
      if (surface.surfaceSource === "fallback") return false;
      // Skip already-generated unless overwrite is set
      if (scope !== "missing" && !overwrite && mockup.mockupImageUrl) return false;
      return true;
    });

    const plannedCount = eligibleRows.length;

    // Overall hard limit
    if (!dryRun && plannedCount > SYNC_HARD_LIMIT) {
      return res.status(400).json({
        error: `Sync would update ${plannedCount} selected mockup${plannedCount !== 1 ? "s" : ""}, which exceeds the safe limit of ${SYNC_HARD_LIMIT} per request. Narrow your selection and try again.`,
        plannedCount,
        limit: SYNC_HARD_LIMIT,
      });
    }

    // ── 4. Report skipped rows (already has image, overwrite = false) ─────────
    const skippedRows = mockupRows.filter(({ mockup }) => {
      if (scope === "missing") return false;
      return !overwrite && !!mockup.mockupImageUrl;
    });

    // ── 5. Main sync loop ─────────────────────────────────────────────────────
    const results: SyncResult[] = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    // Report pre-skipped rows
    for (const { mockup, poster, template } of skippedRows) {
      skipped++;
      results.push({
        posterId: poster.id,
        posterTitle: poster.title,
        templateId: template.id,
        templateName: template.name,
        action: "skipped",
        reason: "Mockup already generated (use overwrite to regenerate)",
        mockupId: mockup.id,
        imageUrl: mockup.mockupImageUrl ?? undefined,
      });
    }

    for (const { mockup, poster, template } of eligibleRows) {
      // Resolve the effective poster surface for this template
      const surface = resolveEffectiveMockupSurface(template);
      const {
        posterX,
        posterY,
        posterWidth,
        posterHeight,
        rotation,
        corners,
        geometryMode: surfaceGeometryMode,
        surfaceSource,
        warnings: surfaceWarnings,
      } = surface;

      const placementSource = "manual" as const;
      const placementWarnings = surfaceWarnings;
      const surfaceWarning = surfaceWarnings.length > 0 ? surfaceWarnings[0] : undefined;

      if (dryRun) {
        generated++;
        results.push({
          posterId: poster.id,
          posterTitle: poster.title,
          templateId: template.id,
          templateName: template.name,
          action: "generated",
          reason: `dry-run (surface: ${getSurfaceSourceLabel(surfaceSource)})`,
          mockupId: mockup.id,
          placementSource,
          placementWarnings,
          surfaceSource,
          surfaceWarning,
        });
        continue;
      }

      if (!poster.imageUrl) {
        failed++;
        results.push({
          posterId: poster.id,
          posterTitle: poster.title,
          templateId: template.id,
          templateName: template.name,
          action: "failed",
          reason: "Poster has no imageUrl",
          mockupId: mockup.id,
        });
        continue;
      }

      if (surfaceSource === "fallback") {
        failed++;
        results.push({
          posterId: poster.id,
          posterTitle: poster.title,
          templateId: template.id,
          templateName: template.name,
          action: "failed",
          reason: "Template has no valid poster surface defined",
          mockupId: mockup.id,
          surfaceSource,
        });
        continue;
      }

      try {
        // ── Build surface config for unified renderer ─────────────────────────
        let renderSurface: RenderSurface;
        let finalSurfaceWarning: string | undefined = surfaceWarning;

        if (surfaceGeometryMode === "corners" && corners != null) {
          renderSurface = {
            mode: "corners",
            corners,
            fitMode: surface.fitMode,
            borderRadius: template.borderRadius,
          };
        } else {
          if (posterX == null || posterY == null || posterWidth == null || posterHeight == null) {
            failed++;
            results.push({
              posterId: poster.id,
              posterTitle: poster.title,
              templateId: template.id,
              templateName: template.name,
              action: "failed",
              reason: `No valid placement found (surface: ${getSurfaceSourceLabel(surfaceSource)})`,
              mockupId: mockup.id,
              surfaceSource,
            });
            continue;
          }
          renderSurface = {
            mode: "bbox",
            posterX,
            posterY,
            posterWidth,
            posterHeight,
            rotation,
            fitMode: surface.fitMode,
            borderRadius: template.borderRadius,
          };
        }

        // ── Unified render call ───────────────────────────────────────────────
        //
        // Both bounding-box and perspective templates now go through the same
        // layer pipeline: base → adjusted poster → effects overlay → foreground.
        // Brightness / contrast / saturation are applied to the poster only.
        const renderResult = await renderMockup({
          templateImageUrl: template.backgroundImageUrl!,
          posterImageUrl: poster.imageUrl,
          surface: renderSurface,
          adjustments: {
            brightness: template.brightness,
            contrast: template.contrast,
            saturation: template.saturation,
          },
          effectsOverlayUrl: template.lightingOverlayUrl,
          foregroundImageUrl: template.foregroundImageUrl,
          effectsBlendMode: template.defaultLightingBlendMode,
          effectsOpacity: template.defaultLightingOpacity,
          foregroundOpacity: template.defaultForegroundOpacity,
        });

        if (renderResult.surfaceWarning) {
          finalSurfaceWarning = renderResult.surfaceWarning;
        }

        // ── Safe replacement: upload → update DB → delete old ─────────────────
        //
        // The old composite is deleted ONLY after the database has been updated
        // with the new URL.  This ensures the customer always sees a valid image:
        //
        //   1. Upload new image to object storage.
        //   2. Update DB with new URL (status = generated).
        //   3. Delete old image from storage (non-fatal if this fails).
        //
        // If rendering, upload, or DB update fails, the catch block marks the
        // mockup as "failed" without clearing mockupImageUrl so the previously
        // generated image remains visible.

        const objectPath = `mockup-composites/${poster.id}/${template.id}-${randomUUID()}.jpg`;
        await storage.uploadBuffer(objectPath, renderResult.buffer, "image/jpeg");
        const imageUrl = `/api/storage/objects/${objectPath}`;

        // Snapshot the previous URL before overwriting it in the DB.
        const previousUrl = mockup.mockupImageUrl;

        await db
          .update(posterMockupsTable)
          .set({
            mockupImageUrl: imageUrl,
            status: "generated",
            generatedAt: new Date(),
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(posterMockupsTable.id, mockup.id));

        // Delete the old composite only after the DB update succeeds.
        // Failure to delete is non-fatal — we log a warning and continue.
        await tryDeleteOldComposite(previousUrl, req.log);

        generated++;
        results.push({
          posterId: poster.id,
          posterTitle: poster.title,
          templateId: template.id,
          templateName: template.name,
          action: "generated",
          mockupId: mockup.id,
          imageUrl,
          placementSource,
          placementWarnings,
          surfaceSource,
          surfaceWarning: finalSurfaceWarning,
        });
      } catch (err: unknown) {
        // ── Render / upload / DB update failed ────────────────────────────────
        //
        // Mark the mockup as failed but do NOT clear mockupImageUrl.
        // The previously generated customer image remains intact.
        const msg = err instanceof Error ? err.message : "Unknown error";
        req.log.error({ err, posterId: poster.id, templateId: template.id }, "Sync failed");

        await db
          .update(posterMockupsTable)
          .set({ status: "failed", errorMessage: msg, updatedAt: new Date() })
          .where(eq(posterMockupsTable.id, mockup.id));

        failed++;
        results.push({
          posterId: poster.id,
          posterTitle: poster.title,
          templateId: template.id,
          templateName: template.name,
          action: "failed",
          reason: msg,
          mockupId: mockup.id,
        });
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
