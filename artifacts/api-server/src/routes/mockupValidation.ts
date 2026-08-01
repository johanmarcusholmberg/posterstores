/**
 * Phase 3 — Mockup Template Validation & Preview Routes
 *
 * POST /api/admin/mockup-templates/:id/validate
 *   Validate a saved template (no mutation).
 *
 * POST /api/admin/mockup-templates/validate-draft
 *   Validate a draft template sent in the request body (no mutation, no save).
 *
 * POST /api/admin/mockup-templates/:id/preview
 *   Render a server-side preview JPEG for a saved template + selected poster.
 *   Uploads to mockup-previews/{templateId}/latest.jpg (overwrites previous preview).
 *   Does NOT write to poster_mockups.
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@workspace/db";
import { mockupTemplatesTable, postersTable } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { validateMockupTemplate } from "../lib/mockupTemplateValidation";
import { renderMockup, type RenderSurface, type RenderMockupResult } from "../lib/mockupCompositor";
import { resolveEffectiveMockupSurface } from "../lib/mockupSurfaceResolver";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();

// ─── POST /api/admin/mockup-templates/:id/validate ────────────────────────────

router.post(
  "/admin/mockup-templates/:id/validate",
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid template id" });

    const [template] = await db
      .select()
      .from(mockupTemplatesTable)
      .where(eq(mockupTemplatesTable.id, id));

    if (!template) return res.status(404).json({ error: "Template not found" });

    const result = await validateMockupTemplate(template);
    return res.json(result);
  }
);

// ─── POST /api/admin/mockup-templates/validate-draft ─────────────────────────

router.post(
  "/admin/mockup-templates/validate-draft",
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    const result = await validateMockupTemplate(req.body ?? {});
    return res.json(result);
  }
);

// ─── POST /api/admin/mockup-templates/:id/preview ────────────────────────────
//
// Body: { posterId: number }
//
// 1. Load template + poster from DB.
// 2. Run full validation — abort with 400 if blocking errors found.
// 3. Render with renderMockup() (same pipeline as production sync).
// 4. Upload to mockup-previews/{templateId}/latest.jpg (deterministic path —
//    writing the same key overwrites the previous preview without needing cleanup).
// 5. Return { previewUrl, validation, width, height }.

router.post(
  "/admin/mockup-templates/:id/preview",
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid template id" });

    const posterId = Number(req.body?.posterId);
    if (!Number.isFinite(posterId) || posterId <= 0) {
      return res.status(400).json({ error: "posterId is required and must be a positive integer" });
    }

    // ── Load template & poster ───────────────────────────────────────────────
    const [[template], [poster]] = await Promise.all([
      db.select().from(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, id)),
      db.select().from(postersTable).where(eq(postersTable.id, posterId)),
    ]);

    if (!template) return res.status(404).json({ error: "Template not found" });
    if (!poster) return res.status(404).json({ error: "Poster not found" });
    if (!poster.imageUrl) {
      return res.status(400).json({ error: "Selected poster has no image URL" });
    }

    // ── Validate template ────────────────────────────────────────────────────
    const validation = await validateMockupTemplate(template);
    if (!validation.previewable) {
      return res.status(400).json({
        error: "Template cannot be previewed because it has validation errors",
        validation,
      });
    }

    // ── Build render surface ─────────────────────────────────────────────────
    const surface = resolveEffectiveMockupSurface(template);
    let renderSurface: RenderSurface;

    if (surface.geometryMode === "corners" && surface.corners != null) {
      renderSurface = {
        mode: "corners",
        corners: surface.corners,
        fitMode: surface.fitMode,
        borderRadius: template.borderRadius,
      };
    } else {
      const { posterX, posterY, posterWidth, posterHeight, rotation } = surface;
      if (posterX == null || posterY == null || posterWidth == null || posterHeight == null) {
        return res.status(400).json({ error: "Template surface has no valid placement coordinates" });
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

    // ── Render ───────────────────────────────────────────────────────────────
    let renderResult: Awaited<ReturnType<typeof renderMockup>>;
    try {
      renderResult = await renderMockup({
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Render failed";
      req.log.error({ err, templateId: id, posterId }, "Preview render failed");
      return res.status(500).json({ error: `Preview render failed: ${msg}`, validation });
    }

    // ── Upload to deterministic preview path ─────────────────────────────────
    // Uploading to the same key each time overwrites the previous preview —
    // no cleanup step needed.
    const objectPath = `mockup-previews/${id}/latest.jpg`;
    try {
      await storage.uploadBuffer(objectPath, renderResult.buffer, "image/jpeg");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      req.log.error({ err, templateId: id }, "Preview upload failed");
      return res.status(500).json({ error: `Preview upload failed: ${msg}`, validation });
    }

    const previewUrl = `/api/storage/objects/${objectPath}`;

    // Read final dimensions from the JPEG buffer.
    const meta = await sharp(renderResult.buffer).metadata();

    return res.json({
      previewUrl,
      validation,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    });
  }
);

export default router;
