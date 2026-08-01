/**
 * Phase 3 — Mockup Template Validation Service
 *
 * Provides a shared backend validation function used by:
 *  - POST /api/admin/mockup-templates/:id/validate
 *  - POST /api/admin/mockup-templates/validate-draft
 *  - POST /api/admin/mockup-templates/:id/preview   (pre-render check)
 *  - Sync route (once per template per request, including dry runs)
 *
 * The validation service intentionally does NOT mutate the template
 * and does NOT trigger side effects (no uploads, no DB writes).
 *
 * Image buffers fetched during one validate call are reused within
 * that call (e.g. the base buffer is fetched once and used for both
 * metadata inspection and dimension comparisons).
 */

import sharp from "sharp";
import { fetchImageBuffer, MAX_IMAGE_DOWNLOAD_BYTES, MAX_DECODED_IMAGE_PIXELS } from "./mockupCompositor";
import { resolveEffectiveMockupSurface } from "./mockupSurfaceResolver";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Recommended minimum short-side resolution for a usable base image.
 * Below this threshold validation emits a warning (not an error).
 */
export const RECOMMENDED_BASE_MIN_SHORT_SIDE = 1200;

// ─── Shared types ─────────────────────────────────────────────────────────────

export type MockupTemplateValidationSeverity = "error" | "warning" | "info";

export type MockupTemplateValidationField =
  | "backgroundImageUrl"
  | "placementConfig"
  | "posterSurface"
  | "lightingOverlayUrl"
  | "foregroundImageUrl"
  | "dimensions"
  | "transparency"
  | "preview";

export interface MockupTemplateValidationIssue {
  code: string;
  severity: MockupTemplateValidationSeverity;
  field: MockupTemplateValidationField;
  message: string;
}

export interface MockupImageMetadata {
  width: number;
  height: number;
  format: string | null;
  hasAlpha: boolean;
  /** True when the image has an alpha channel but all pixels are ≥ 254/255 opaque. */
  isOpaque: boolean;
  channels: number | null;
  sizeBytes: number | null;
}

export interface MockupTemplateValidationResult {
  /** No issues of severity "error". Warnings are allowed. */
  valid: boolean;
  /** Base valid + surface valid + no blocking layer errors. */
  previewable: boolean;
  /**
   * Phase 3: derived from previewable (no persistent fingerprint yet).
   * Phase 4 will add render-fingerprint tracking.
   */
  readyForSync: boolean;
  issues: MockupTemplateValidationIssue[];
  images: {
    base: MockupImageMetadata | null;
    effects: MockupImageMetadata | null;
    foreground: MockupImageMetadata | null;
  };
  surface: {
    valid: boolean;
    source: string | null;
    geometryMode: "corners" | "bounding_box" | null;
    warnings: string[];
  };
}

// ─── Template input shape (minimal — only fields needed for validation) ────────

export interface MockupTemplateInput {
  backgroundImageUrl?: string | null;
  placementConfig?: unknown;
  posterX?: number | null;
  posterY?: number | null;
  posterWidth?: number | null;
  posterHeight?: number | null;
  rotation?: number | null;
  fitMode?: string | null;
  borderRadius?: number | null;
  lightingOverlayUrl?: string | null;
  foregroundImageUrl?: string | null;
  defaultLightingOpacity?: number | null;
  defaultForegroundOpacity?: number | null;
  brightness?: number | null;
  contrast?: number | null;
  saturation?: number | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const SUPPORTED_FORMATS = ["jpeg", "png", "webp"];

/**
 * Fetch an image URL and return its Sharp metadata along with the raw buffer.
 * Returns an error string on any failure.
 *
 * The returned buffer is reused within the same validation call — do not
 * re-download the same URL twice.
 */
async function fetchAndInspectImage(url: string): Promise<
  | { ok: true; buf: Buffer; meta: MockupImageMetadata; width: number; height: number }
  | { ok: false; error: string }
> {
  let buf: Buffer;
  try {
    buf = await fetchImageBuffer(url, MAX_IMAGE_DOWNLOAD_BYTES);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const meta = await sharp(buf, { limitInputPixels: MAX_DECODED_IMAGE_PIXELS }).metadata();

    const fmt = meta.format ?? null;
    if (!fmt || !SUPPORTED_FORMATS.includes(fmt)) {
      return {
        ok: false,
        error: `Unsupported image format: ${fmt ?? "unknown"}. Supported formats: JPEG, PNG, WebP.`,
      };
    }

    const w = meta.width;
    const h = meta.height;
    if (!w || !h || w === 0 || h === 0) {
      return { ok: false, error: "Could not read image dimensions." };
    }

    const hasAlpha = meta.hasAlpha ?? false;
    let isOpaque = !hasAlpha;

    if (hasAlpha) {
      try {
        const stats = await sharp(buf, { limitInputPixels: MAX_DECODED_IMAGE_PIXELS }).stats();
        // The alpha channel is the last channel in the stats array.
        const alphaStats = stats.channels[stats.channels.length - 1];
        // All pixels opaque if minimum alpha value ≥ 254 (nearly full opacity).
        isOpaque = alphaStats.min >= 254;
      } catch {
        // Stats unavailable — assume not fully opaque (safer for warnings).
        isOpaque = false;
      }
    }

    const imageMeta: MockupImageMetadata = {
      width: w,
      height: h,
      format: fmt,
      hasAlpha,
      isOpaque,
      channels: meta.channels ?? null,
      sizeBytes: buf.byteLength,
    };

    return { ok: true, buf, meta: imageMeta, width: w, height: h };
  } catch (err) {
    return {
      ok: false,
      error: `Invalid image data: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validate a mockup template configuration.
 *
 * Downloads and inspects the Base, Effects, and Foreground images.
 * Resolves and validates the poster surface.
 * Returns a structured result with per-field issues and image metadata.
 *
 * This function is read-only: it does not mutate the template or write to storage.
 * Each image URL is fetched at most once within a single call.
 */
export async function validateMockupTemplate(
  template: MockupTemplateInput
): Promise<MockupTemplateValidationResult> {
  const issues: MockupTemplateValidationIssue[] = [];
  let baseMeta: MockupImageMetadata | null = null;
  let effectsMeta: MockupImageMetadata | null = null;
  let foregroundMeta: MockupImageMetadata | null = null;
  let baseWidth = 0;
  let baseHeight = 0;
  let surfaceValid = false;
  let surfaceSource: string | null = null;
  let surfaceGeometryMode: "corners" | "bounding_box" | null = null;
  let surfaceWarnings: string[] = [];

  // ── 1. Base image ───────────────────────────────────────────────────────────
  if (!template.backgroundImageUrl) {
    issues.push({
      code: "BASE_MISSING",
      severity: "error",
      field: "backgroundImageUrl",
      message:
        "Base image is required. Upload a background image before previewing or syncing.",
    });
  } else {
    const result = await fetchAndInspectImage(template.backgroundImageUrl);

    if (!result.ok) {
      const isFetchError =
        result.error.includes("fetch") ||
        result.error.includes("Failed to") ||
        result.error.includes("404") ||
        result.error.includes("timeout") ||
        result.error.includes("resolve") ||
        result.error.includes("private");
      issues.push({
        code: isFetchError ? "BASE_FETCH_FAILED" : "BASE_INVALID_IMAGE",
        severity: "error",
        field: "backgroundImageUrl",
        message: `Base image could not be loaded: ${result.error}`,
      });
    } else {
      baseMeta = result.meta;
      baseWidth = result.width;
      baseHeight = result.height;

      const shortSide = Math.min(baseWidth, baseHeight);
      if (shortSide < RECOMMENDED_BASE_MIN_SHORT_SIDE) {
        issues.push({
          code: "BASE_RESOLUTION_LOW",
          severity: "warning",
          field: "backgroundImageUrl",
          message:
            `Base image short side is ${shortSide} px. ` +
            `Recommended minimum is ${RECOMMENDED_BASE_MIN_SHORT_SIDE} px for production quality. ` +
            `The template is valid but may produce lower-quality mockups.`,
        });
      }
    }
  }

  // ── 2. Poster surface ───────────────────────────────────────────────────────
  if (!baseMeta) {
    // Base failed — surface cannot be meaningfully validated.
    issues.push({
      code: "SURFACE_MISSING",
      severity: "error",
      field: "posterSurface",
      message:
        "Poster surface cannot be validated without a valid Base image. Fix Base image errors first.",
    });
  } else {
    try {
      const surface = resolveEffectiveMockupSurface(template as Parameters<typeof resolveEffectiveMockupSurface>[0]);

      if (surface.surfaceSource === "fallback") {
        issues.push({
          code: "SURFACE_MISSING",
          severity: "error",
          field: "posterSurface",
          message:
            "No poster surface is defined. Set bounding-box coordinates or draw four corner points before previewing or syncing.",
        });
      } else {
        surfaceValid = true;
        surfaceSource = surface.surfaceSource;
        surfaceGeometryMode = surface.geometryMode;
        surfaceWarnings = surface.warnings;

        for (const w of surface.warnings) {
          issues.push({
            code: "SURFACE_INVALID",
            severity: "warning",
            field: "posterSurface",
            message: w,
          });
        }
      }
    } catch (err) {
      issues.push({
        code: "SURFACE_INVALID",
        severity: "error",
        field: "posterSurface",
        message: `Poster surface configuration is invalid: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  }

  // ── 3. Effects overlay ──────────────────────────────────────────────────────
  if (template.lightingOverlayUrl) {
    const result = await fetchAndInspectImage(template.lightingOverlayUrl);

    if (!result.ok) {
      issues.push({
        code: "EFFECTS_FETCH_FAILED",
        severity: "error",
        field: "lightingOverlayUrl",
        message: `Effects overlay could not be loaded: ${result.error}`,
      });
    } else {
      effectsMeta = result.meta;

      // Dimension match against raw base dimensions.
      if (baseMeta && (result.width !== baseWidth || result.height !== baseHeight)) {
        issues.push({
          code: "EFFECTS_DIMENSION_MISMATCH",
          severity: "error",
          field: "lightingOverlayUrl",
          message:
            `Effects overlay dimensions do not match Base image dimensions. ` +
            `Overlay is ${result.width}×${result.height} px, but Base image is ` +
            `${baseWidth}×${baseHeight} px. Upload an overlay with exactly the same dimensions.`,
        });
      }

      // Alpha / transparency.
      if (!result.meta.hasAlpha) {
        issues.push({
          code: "EFFECTS_NO_ALPHA",
          severity: "error",
          field: "lightingOverlayUrl",
          message:
            "Effects overlay has no alpha channel. The overlay must be a PNG or WebP file with transparency.",
        });
      } else if (result.meta.isOpaque) {
        issues.push({
          code: "EFFECTS_FULLY_OPAQUE",
          severity: "warning",
          field: "lightingOverlayUrl",
          message:
            "Effects overlay appears fully opaque — no transparent pixels detected. " +
            "An intentional full-image blend layer is allowed, but verify this is intended.",
        });
      }
    }
  }

  // ── 4. Foreground ───────────────────────────────────────────────────────────
  if (template.foregroundImageUrl) {
    const result = await fetchAndInspectImage(template.foregroundImageUrl);

    if (!result.ok) {
      issues.push({
        code: "FOREGROUND_FETCH_FAILED",
        severity: "error",
        field: "foregroundImageUrl",
        message: `Foreground image could not be loaded: ${result.error}`,
      });
    } else {
      foregroundMeta = result.meta;

      // Dimension match.
      if (baseMeta && (result.width !== baseWidth || result.height !== baseHeight)) {
        issues.push({
          code: "FOREGROUND_DIMENSION_MISMATCH",
          severity: "error",
          field: "foregroundImageUrl",
          message:
            `Foreground dimensions do not match Base image dimensions. ` +
            `Foreground is ${result.width}×${result.height} px, but Base image is ` +
            `${baseWidth}×${baseHeight} px. Foreground dimensions must match Base image dimensions exactly.`,
        });
      }

      // Alpha / transparency — foreground MUST have real transparency.
      if (!result.meta.hasAlpha) {
        issues.push({
          code: "FOREGROUND_NO_ALPHA",
          severity: "error",
          field: "foregroundImageUrl",
          message:
            "Foreground image has no alpha channel. " +
            "Foreground must contain transparency so the Base image and inserted poster remain visible.",
        });
      } else if (result.meta.isOpaque) {
        issues.push({
          code: "FOREGROUND_FULLY_OPAQUE",
          severity: "error",
          field: "foregroundImageUrl",
          message:
            "Foreground image is fully opaque. A fully opaque Foreground covers everything below it. " +
            "Foreground must contain transparency so the Base image and inserted poster remain visible.",
        });
      }
    }
  }

  // ── Compute readiness ────────────────────────────────────────────────────────
  const hasBlockingError = issues.some((i) => i.severity === "error");
  const valid = !hasBlockingError;
  const previewable = !!baseMeta && surfaceValid && !hasBlockingError;
  // Phase 3: readyForSync = previewable (no persistent preview fingerprint yet).
  const readyForSync = previewable;

  return {
    valid,
    previewable,
    readyForSync,
    issues,
    images: { base: baseMeta, effects: effectsMeta, foreground: foregroundMeta },
    surface: {
      valid: surfaceValid,
      source: surfaceSource,
      geometryMode: surfaceGeometryMode,
      warnings: surfaceWarnings,
    },
  };
}
