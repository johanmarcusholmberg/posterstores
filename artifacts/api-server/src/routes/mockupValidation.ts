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
 *   Returns { previewUrl: "/api/admin/mockup-previews/{id}?v={ts}", ... }.
 *
 * GET /api/admin/mockup-previews/:templateId
 *   Serve the latest preview JPEG for a template through an admin-protected route.
 *   The raw storage URL is never exposed to clients.
 *   Cache-Control: private, no-store
 */

import { Router } from "express";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@workspace/db";
import { mockupTemplatesTable, postersTable } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { validateMockupTemplate } from "../lib/mockupTemplateValidation";
import { renderMockup, type RenderSurface } from "../lib/mockupCompositor";
import { resolveEffectiveMockupSurface } from "../lib/mockupSurfaceResolver";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();

// ─── POST /api/admin/mockup-templates/:id/validate ────────────────────────────

router.post(
  "/admin/mockup-templates/:id/validate",
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid template id" });
    }

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
// 2. Enforce store compatibility: template.storeKey must be null (global) or
//    match poster.storeKey — otherwise 403.
// 3. Run full validation — abort with 400 if blocking errors found.
// 4. Render with renderMockup() (same pipeline as production sync).
// 5. Upload to mockup-previews/{templateId}/latest.jpg (deterministic path).
// 6. Return { previewUrl: "/api/admin/mockup-previews/{id}?v={ts}", validation, width, height }.
//    The raw storage URL is NEVER returned — the protected preview route must be used instead.

router.post(
  "/admin/mockup-templates/:id/preview",
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid template id" });
    }

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

    // ── Store compatibility check ────────────────────────────────────────────
    // Global templates (storeKey === null) may preview any poster.
    // Store-specific templates may only preview posters from the same store.
    if (template.storeKey !== null && template.storeKey !== poster.storeKey) {
      return res.status(403).json({
        error: "This template cannot be previewed with a poster from another store.",
      });
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

    // Return the protected admin preview URL (not the raw storage URL).
    // The ?v= timestamp busts the browser cache on repeated generations.
    const previewUrl = `/api/admin/mockup-previews/${id}?v=${Date.now()}`;

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

// ─── GET /api/admin/mockup-previews/:templateId ───────────────────────────────
//
// Serve the latest preview JPEG for a template through an admin-protected route.
//
// Requirements:
//  - requireAdmin (and admin rate limiter)
//  - Positive integer templateId
//  - Confirm template exists (404 if not)
//  - Read mockup-previews/{templateId}/latest.jpg from storage
//  - Stream as image/jpeg
//  - Return 404 when no preview has been generated yet
//  - Cache-Control: private, no-store (never cache admin preview images)
//
// The raw /api/storage/objects/... URL is never returned to clients for previews.

router.get(
  "/admin/mockup-previews/:templateId",
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    const id = Number(req.params.templateId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    // Confirm the template exists
    const [template] = await db
      .select({ id: mockupTemplatesTable.id })
      .from(mockupTemplatesTable)
      .where(eq(mockupTemplatesTable.id, id));

    if (!template) return res.status(404).json({ error: "Template not found" });

    // Retrieve the preview object from storage
    const objectPath = `/objects/mockup-previews/${id}/latest.jpg`;
    let objectFile: Awaited<ReturnType<typeof storage.getObjectEntityFile>>;
    try {
      objectFile = await storage.getObjectEntityFile(objectPath);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "No preview has been generated for this template yet." });
      }
      req.log.error({ err, templateId: id }, "Failed to retrieve preview object");
      return res.status(500).json({ error: "Failed to retrieve preview" });
    }

    let response: Awaited<ReturnType<typeof storage.downloadObject>>;
    try {
      response = await storage.downloadObject(objectFile);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "No preview has been generated for this template yet." });
      }
      req.log.error({ err, templateId: id }, "Failed to download preview object");
      return res.status(500).json({ error: "Failed to download preview" });
    }

    // Always override cache headers — preview images are admin-only and must not cache
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "image/jpeg");

    // Forward other headers from storage (skipping the ones we've overridden)
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== "content-type" && lower !== "cache-control") {
        res.setHeader(key, value);
      }
    });

    res.status(200);
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
    return;
  }
);

export default router;
