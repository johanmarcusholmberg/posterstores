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
import {
  compositePosterIntoTemplate,
  compositePosterWithCorners,
} from "../lib/mockupCompositor";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  resolveEffectiveMockupSurface,
  getSurfaceSourceLabel,
  type SurfaceSource,
} from "../lib/mockupPlacementAnalyzer";
import { renderAiMockup } from "../lib/aiMockupRenderer";
import { randomUUID } from "crypto";

const router = Router();
const storage = new ObjectStorageService();

/** Maximum poster × template combinations allowed per non-dry-run request (all renderers). */
const SYNC_HARD_LIMIT = 100;

/**
 * Maximum AI-rendered poster × template combinations allowed per request.
 * AI renders are paid calls (~seconds each) — keep this low to prevent
 * accidental large bills. Dry-run is exempt from this limit.
 */
const AI_RENDER_HARD_LIMIT = 5;

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
  /** Kept for backwards compat — prefer surfaceSource. */
  placementSource?: "auto_detected" | "manual";
  placementWarnings?: string[];
  surfaceSource?: SurfaceSource;
  surfaceWarning?: string;
  renderMode?: "deterministic" | "ai_rendered";
  needsReview?: boolean;
  aiRenderWarning?: string;
  /** Human-readable cost label shown in admin sync results. */
  estimatedCostLabel?: string;
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
    const allPosters = await db
      .select()
      .from(postersTable)
      .where(eq(postersTable.storeKey, storeKey));

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

    // Filter eligible templates:
    // - AI-rendered templates: need background image only (AI figures out placement)
    // - Deterministic templates: need background image + a valid poster surface
    let targetTemplates = templateRows.filter((t) => {
      if (!t.backgroundImageUrl) return false;
      if (t.renderMode === "ai_rendered") return true;
      // Deterministic: need a valid poster surface
      const surface = resolveEffectiveMockupSurface(t);
      return surface.surfaceSource !== "fallback";
    });

    if (templateIds && templateIds.length > 0) {
      targetTemplates = targetTemplates.filter((t) => templateIds.includes(t.id));
    }

    if (targetTemplates.length === 0) {
      return res.json({
        generated: 0, skipped: 0, failed: 0, plannedCount: 0, results: [],
        note: "No active templates with background image and poster surface data found.",
      });
    }

    // ── 3. Safety-limit checks ───────────────────────────────────────────────
    const deterministicTemplates = targetTemplates.filter((t) => (t.renderMode ?? "deterministic") !== "ai_rendered");
    const aiTemplates = targetTemplates.filter((t) => (t.renderMode ?? "deterministic") === "ai_rendered");

    const plannedCount = targetPosters.length * targetTemplates.length;
    const deterministicPlannedCount = targetPosters.length * deterministicTemplates.length;
    const aiRenderedPlannedCount = targetPosters.length * aiTemplates.length;

    // Overall hard limit (all renderers)
    if (!dryRun && plannedCount > SYNC_HARD_LIMIT) {
      return res.status(400).json({
        error: `Sync would generate ${plannedCount} combinations (${targetPosters.length} poster${targetPosters.length !== 1 ? "s" : ""} × ${targetTemplates.length} template${targetTemplates.length !== 1 ? "s" : ""}), which exceeds the safe limit of ${SYNC_HARD_LIMIT} per request.`,
        plannedCount,
        deterministicPlannedCount,
        aiRenderedPlannedCount,
        limit: SYNC_HARD_LIMIT,
      });
    }

    // AI-specific hard limit
    if (!dryRun && aiRenderedPlannedCount > AI_RENDER_HARD_LIMIT) {
      return res.status(400).json({
        error: `Sync would generate ${aiRenderedPlannedCount} AI-rendered mockup${aiRenderedPlannedCount !== 1 ? "s" : ""} (${targetPosters.length} poster${targetPosters.length !== 1 ? "s" : ""} × ${aiTemplates.length} AI template${aiTemplates.length !== 1 ? "s" : ""}), which exceeds the AI render limit of ${AI_RENDER_HARD_LIMIT} per request. Reduce the number of selected posters or AI-rendered templates and try again. Consider using a deterministic template or running on fewer posters.`,
        plannedCount,
        deterministicPlannedCount,
        aiRenderedPlannedCount,
        aiRenderLimit: AI_RENDER_HARD_LIMIT,
      });
    }

    // ── 4. Load existing poster_mockups ──────────────────────────────────────
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

    const assignedPrimary = new Set(
      existingMockups.filter((m) => m.isPrimary).map((m) => m.posterId)
    );
    const assignedHover = new Set(
      existingMockups.filter((m) => m.isHoverMockup).map((m) => m.posterId)
    );

    // ── 5. Main sync loop ────────────────────────────────────────────────────
    const results: SyncResult[] = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const poster of targetPosters) {
      for (const template of targetTemplates) {
        const pairKey = `${poster.id}:${template.id}`;
        const alreadyExists = existingSet.has(pairKey);
        const templateRenderMode = (template.renderMode ?? "deterministic") as "deterministic" | "ai_rendered";

        if (alreadyExists && !overwrite) {
          skipped++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "skipped",
            reason: "Mockup already exists (use overwrite to regenerate)",
            renderMode: templateRenderMode,
          });
          continue;
        }

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

        // Backwards-compat placementSource label
        const placementSource: "auto_detected" | "manual" = surfaceSource.startsWith("auto")
          ? "auto_detected"
          : "manual";
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
            reason: `dry-run (renderer: ${templateRenderMode}, surface: ${getSurfaceSourceLabel(surfaceSource)})`,
            placementSource,
            placementWarnings,
            surfaceSource,
            surfaceWarning,
            renderMode: templateRenderMode,
            needsReview: templateRenderMode === "ai_rendered",
            estimatedCostLabel: templateRenderMode === "ai_rendered" ? "Paid AI render" : undefined,
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
            renderMode: templateRenderMode,
          });
          continue;
        }

        // For deterministic, require a valid surface
        if (
          templateRenderMode === "deterministic" &&
          surfaceSource === "fallback"
        ) {
          failed++;
          results.push({
            posterId: poster.id,
            posterTitle: poster.title,
            templateId: template.id,
            templateName: template.name,
            action: "failed",
            reason: "Deterministic template has no valid poster surface defined",
            surfaceSource,
            renderMode: templateRenderMode,
          });
          continue;
        }

        try {
          let imageBuffer: Buffer;
          let aiRenderWarning: string | undefined;
          let finalSurfaceWarning: string | undefined = surfaceWarning;

          if (templateRenderMode === "ai_rendered") {
            // ── AI render path ─────────────────────────────────────────────
            const aiResult = await renderAiMockup({
              posterImageUrl: poster.imageUrl,
              templateImageUrl: template.backgroundImageUrl!,
              detectedPlacement:
                surfaceSource.startsWith("auto") && template.detectedPlacementConfig
                  ? (template.detectedPlacementConfig as any)
                  : null,
              renderPrompt: template.aiRenderPrompt,
              templateCategory: template.category,
              templateName: template.name,
            });

            if (aiResult.status === "failed") {
              failed++;
              results.push({
                posterId: poster.id,
                posterTitle: poster.title,
                templateId: template.id,
                templateName: template.name,
                action: "failed",
                reason: `AI render failed: ${aiResult.error}`,
                renderMode: templateRenderMode,
              });
              continue;
            }

            imageBuffer = aiResult.imageBuffer!;
            aiRenderWarning = aiResult.warning;
          } else if (
            surfaceGeometryMode === "corners" &&
            corners != null
          ) {
            // ── Perspective warp path ──────────────────────────────────────
            const result = await compositePosterWithCorners(
              template.backgroundImageUrl!,
              poster.imageUrl,
              {
                corners,
                fitMode: template.fitMode,
                borderRadius: template.borderRadius,
                brightness: template.brightness,
                contrast: template.contrast,
                saturation: template.saturation,
              }
            );
            imageBuffer = result.buffer;
            if (result.surfaceWarning) {
              finalSurfaceWarning = result.surfaceWarning;
            }
          } else {
            // ── Deterministic bounding-box compositor path ─────────────────
            if (posterX == null || posterY == null || posterWidth == null || posterHeight == null) {
              failed++;
              results.push({
                posterId: poster.id,
                posterTitle: poster.title,
                templateId: template.id,
                templateName: template.name,
                action: "failed",
                reason: `No valid placement found (surface: ${getSurfaceSourceLabel(surfaceSource)})`,
                surfaceSource,
                renderMode: templateRenderMode,
              });
              continue;
            }
            imageBuffer = await compositePosterIntoTemplate(
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
          }

          // ── Upload result ──────────────────────────────────────────────
          const subPath = `mockup-composites/${storeKey}/${poster.id}/${template.id}-${randomUUID().slice(0, 8)}.jpg`;
          const objectPath = await storage.uploadBuffer(subPath, imageBuffer, "image/jpeg");
          const imageUrl = `/api/storage${objectPath}`;

          const now = new Date();

          // AI-rendered mockups NEVER become primary/hover/gallery automatically
          // and always start as not approved for public
          const isAiRendered = templateRenderMode === "ai_rendered";
          const isPrimary = !isAiRendered && template.canBePrimary && !assignedPrimary.has(poster.id);
          const isHover = !isAiRendered && template.canBeHover && !assignedHover.has(poster.id);
          const isGallery = !isAiRendered && template.canBeGallery;
          const needsReview = isAiRendered;

          if (alreadyExists && overwrite) {
            const existing = existingMockups.find(
              (m) => m.posterId === poster.id && m.mockupTemplateId === template.id
            );
            if (existing) {
              await tryDeleteOldComposite(existing.mockupImageUrl, req.log);

              await db
                .update(posterMockupsTable)
                .set({
                  mockupImageUrl: imageUrl,
                  status: "generated",
                  generatedAt: now,
                  errorMessage: null,
                  renderMode: templateRenderMode,
                  needsReview,
                  aiRenderWarning: aiRenderWarning ?? null,
                  sourcePosterImageUrl: poster.imageUrl,
                  sourceTemplateImageUrl: template.backgroundImageUrl ?? null,
                  // Keep approvedForPublic as-is for overwrites (admin may have already approved)
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
                surfaceSource,
                surfaceWarning: finalSurfaceWarning,
                renderMode: templateRenderMode,
                needsReview,
                aiRenderWarning,
                estimatedCostLabel: isAiRendered ? "Paid AI render" : undefined,
              });
              continue;
            }
          }

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
              renderMode: templateRenderMode,
              needsReview,
              aiRenderWarning: aiRenderWarning ?? null,
              sourcePosterImageUrl: poster.imageUrl,
              sourceTemplateImageUrl: template.backgroundImageUrl ?? null,
              approvedForPublic: false,
            })
            .onConflictDoNothing()
            .returning();

          if (!inserted) {
            skipped++;
            results.push({
              posterId: poster.id,
              posterTitle: poster.title,
              templateId: template.id,
              templateName: template.name,
              action: "skipped",
              reason: "Conflict — pair was already inserted by a concurrent sync",
              renderMode: templateRenderMode,
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
            surfaceSource,
            surfaceWarning: finalSurfaceWarning,
            renderMode: templateRenderMode,
            needsReview,
            aiRenderWarning,
            estimatedCostLabel: isAiRendered ? "Paid AI render" : undefined,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          req.log.error({ err, posterId: poster.id, templateId: template.id }, "Sync failed");

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
                isGallery: false,
                status: "failed",
                errorMessage: msg,
                renderMode: templateRenderMode,
                needsReview: false,
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
            renderMode: templateRenderMode,
          });
        }
      }
    }

    const needsReviewCount = results.filter((r) => r.action === "generated" && r.needsReview).length;

    return res.json({
      generated,
      skipped,
      failed,
      plannedCount,
      deterministicPlannedCount,
      aiRenderedPlannedCount,
      dryRun,
      needsReviewCount,
      results,
    });
  }
);

export default router;
