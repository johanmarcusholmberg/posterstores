import type { CornerPoints } from "./mockupCompositor";

// ─── Surface model overview ───────────────────────────────────────────────────
//
// User-facing terminology (admin UI):
//   "Poster surface"    — the area where the poster artwork will be inserted.
//   "Rendered mockup"   — the generated flattened image stored as mockupImageUrl.
//
// Resolution priority (resolveEffectiveMockupSurface):
//   1. placementConfig with valid corners (admin manual corner surface)
//   2. placementConfig with valid bounding box (admin manual bbox)
//   3. Legacy: posterX/Y/Width/Height scalar fields
//   4. Fallback (no surface — sync will skip this template)
//
// ─────────────────────────────────────────────────────────────────────────────

export type FitMode = "cover" | "contain";

export interface NormalizedPoint {
  x: number;
  y: number;
}

/**
 * Admin-defined manual poster surface.
 * Stored in the `placement_config` JSONB column.
 */
export interface ManualSurfaceConfig {
  mode: "corners" | "bounding_box";
  coordinateSystem: "normalized";
  source: "manual";
  corners?: {
    topLeft: NormalizedPoint;
    topRight: NormalizedPoint;
    bottomRight: NormalizedPoint;
    bottomLeft: NormalizedPoint;
  };
  boundingBox?: { x: number; y: number; width: number; height: number };
  fitMode?: string;
}

/**
 * How the poster is geometrically composited onto the background.
 */
export type SurfaceGeometryMode = "corners" | "bounding_box";
/** @deprecated Use SurfaceGeometryMode */
export type SurfaceRenderMode = SurfaceGeometryMode;

export type SurfaceSource = "manual_corners" | "manual_bbox" | "fallback";

/**
 * Resolved poster surface, ready for the compositor.
 * When `geometryMode === "corners"`, use `corners` + `compositePosterWithCorners`.
 * When `geometryMode === "bounding_box"`, use `posterX/Y/Width/Height` + `compositePosterIntoTemplate`.
 */
export interface EffectiveMockupSurface {
  geometryMode: SurfaceGeometryMode;
  corners: CornerPoints | null;
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number;
  fitMode: "cover" | "contain";
  surfaceSource: SurfaceSource;
  warnings: string[];
}

/**
 * Normalize an unknown fit-mode value to the two allowed production values.
 * Any value that is not exactly "cover" becomes "contain".
 * This eliminates legacy "stretch" values and any garbage from placementConfig JSON.
 */
export function normalizeSurfaceFitMode(value: unknown): "cover" | "contain" {
  return value === "cover" ? "cover" : "contain";
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Convert a normalized bounding box to four rectangular corners. */
export function convertBoundingBoxToCorners(bb: {
  x: number;
  y: number;
  width: number;
  height: number;
}): CornerPoints {
  return {
    topLeft: { x: bb.x, y: bb.y },
    topRight: { x: bb.x + bb.width, y: bb.y },
    bottomRight: { x: bb.x + bb.width, y: bb.y + bb.height },
    bottomLeft: { x: bb.x, y: bb.y + bb.height },
  };
}

/** Convert four corners to an axis-aligned bounding box (normalized 0–1 scale). */
export function convertCornersToBoundingBox(corners: CornerPoints): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x];
  const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Normalize corners from pixel coordinates to 0–1 range using image dimensions. */
export function normalizeSurfaceCorners(
  corners: CornerPoints,
  imageWidth: number,
  imageHeight: number
): CornerPoints {
  const norm = (pt: { x: number; y: number }) => ({
    x: round3(clamp(pt.x / imageWidth, 0, 1)),
    y: round3(clamp(pt.y / imageHeight, 0, 1)),
  });
  return {
    topLeft: norm(corners.topLeft),
    topRight: norm(corners.topRight),
    bottomRight: norm(corners.bottomRight),
    bottomLeft: norm(corners.bottomLeft),
  };
}

/** Convert normalized corners (0–1) to pixel coordinates. */
export function denormalizeSurfaceCorners(
  corners: CornerPoints,
  imageWidth: number,
  imageHeight: number
): CornerPoints {
  const denorm = (pt: { x: number; y: number }) => ({
    x: Math.round(pt.x * imageWidth),
    y: Math.round(pt.y * imageHeight),
  });
  return {
    topLeft: denorm(corners.topLeft),
    topRight: denorm(corners.topRight),
    bottomRight: denorm(corners.bottomRight),
    bottomLeft: denorm(corners.bottomLeft),
  };
}

/**
 * Validate that a set of corners is a usable (non-degenerate) quadrilateral.
 * Returns null on success or an error string on failure.
 */
export function validateSurfaceCorners(corners: CornerPoints): string | null {
  const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  for (const pt of pts) {
    if (typeof pt.x !== "number" || typeof pt.y !== "number") return "Corner coordinates must be numbers";
    if (pt.x < 0 || pt.x > 1 || pt.y < 0 || pt.y > 1) return "Corner coordinates must be in 0–1 range";
  }
  const bb = convertCornersToBoundingBox(corners);
  if (bb.width < 0.01) return "Poster surface is too narrow (width < 1% of image)";
  if (bb.height < 0.01) return "Poster surface is too short (height < 1% of image)";
  return null;
}

/**
 * Returns a human-readable label for the surface source, shown in admin sync results.
 */
export function getSurfaceSourceLabel(source: SurfaceSource): string {
  switch (source) {
    case "manual_corners": return "Manual surface (corners, perspective)";
    case "manual_bbox": return "Manual surface (bounding box)";
    case "fallback": return "Fallback (no surface defined)";
  }
}

/**
 * Return true when the corners represent a meaningfully non-rectangular quad
 * (i.e. perspective rendering will differ from a simple bbox render).
 */
function isNonRectangular(corners: CornerPoints, tol = 0.005): boolean {
  const { topLeft: TL, topRight: TR, bottomRight: BR, bottomLeft: BL } = corners;
  return !(
    Math.abs(TL.y - TR.y) < tol &&
    Math.abs(BL.y - BR.y) < tol &&
    Math.abs(TL.x - BL.x) < tol &&
    Math.abs(TR.x - BR.x) < tol
  );
}

/**
 * Resolve the effective poster surface for a template.
 *
 * Priority:
 *   1. placementConfig with valid corners (admin manual surface column — corner mode)
 *   2. placementConfig with valid bounding box (admin manual surface column — bbox mode)
 *   3. Legacy: posterX/Y/Width/Height scalar fields
 *   4. Fallback (no surface — sync will skip this template)
 *
 * User-facing name: "Poster surface".
 */
export function resolveEffectiveMockupSurface(template: {
  /** Admin-defined manual surface (placement_config column). */
  placementConfig?: unknown;
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number | null;
  fitMode?: string | null;
}): EffectiveMockupSurface {
  // ── Priority 1 & 2: Admin-defined manual surface (placement_config column) ─
  if (template.placementConfig) {
    try {
      const mc = template.placementConfig as ManualSurfaceConfig;
      if (mc.source === "manual" && mc.coordinateSystem === "normalized") {
        if (mc.mode === "corners" && mc.corners) {
          const c = mc.corners;
          const cornersObj: CornerPoints = {
            topLeft: c.topLeft,
            topRight: c.topRight,
            bottomRight: c.bottomRight,
            bottomLeft: c.bottomLeft,
          };
          const cornerError = validateSurfaceCorners(cornersObj);
          if (!cornerError) {
            const bb = convertCornersToBoundingBox(cornersObj);
            const geometryMode: SurfaceGeometryMode = isNonRectangular(cornersObj) ? "corners" : "bounding_box";
            return {
              geometryMode,
              corners: cornersObj,
              posterX: round3(bb.x * 100),
              posterY: round3(bb.y * 100),
              posterWidth: round3(bb.width * 100),
              posterHeight: round3(bb.height * 100),
              rotation: 0,
              fitMode: normalizeSurfaceFitMode(mc.fitMode ?? template.fitMode),
              surfaceSource: geometryMode === "corners" ? "manual_corners" : "manual_bbox",
              warnings: [],
            };
          }
        }
        if (mc.mode === "bounding_box" && mc.boundingBox) {
          const bb = mc.boundingBox;
          if (bb.width > 0.01 && bb.height > 0.01) {
            return {
              geometryMode: "bounding_box",
              corners: null,
              posterX: round3(bb.x * 100),
              posterY: round3(bb.y * 100),
              posterWidth: round3(bb.width * 100),
              posterHeight: round3(bb.height * 100),
              rotation: 0,
              fitMode: normalizeSurfaceFitMode(mc.fitMode ?? template.fitMode),
              surfaceSource: "manual_bbox",
              warnings: [],
            };
          }
        }
      }
    } catch {
      // fall through
    }
  }

  // ── Priority 3: Legacy manual bounding box (posterX/Y/Width/Height fields) ─
  if (
    template.posterX != null &&
    template.posterY != null &&
    template.posterWidth != null &&
    template.posterHeight != null
  ) {
    return {
      geometryMode: "bounding_box",
      corners: null,
      posterX: template.posterX,
      posterY: template.posterY,
      posterWidth: template.posterWidth,
      posterHeight: template.posterHeight,
      rotation: template.rotation ?? 0,
      fitMode: normalizeSurfaceFitMode(template.fitMode),
      surfaceSource: "manual_bbox",
      warnings: [],
    };
  }

  // ── Priority 4: No valid surface ─────────────────────────────────────────
  return {
    geometryMode: "bounding_box",
    corners: null,
    posterX: null,
    posterY: null,
    posterWidth: null,
    posterHeight: null,
    rotation: template.rotation ?? 0,
    fitMode: normalizeSurfaceFitMode(template.fitMode),
    surfaceSource: "fallback",
    warnings: ["No poster surface defined — skipping sync for this template"],
  };
}

/**
 * Backwards-compatible wrapper that returns the flattened placement fields
 * that pre-surface-API callers expect.
 */
export function resolveEffectiveMockupPlacement(template: Parameters<typeof resolveEffectiveMockupSurface>[0]): {
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number;
  placementSource: "auto_detected" | "manual";
  warnings: string[];
} {
  const s = resolveEffectiveMockupSurface(template);
  return {
    posterX: s.posterX,
    posterY: s.posterY,
    posterWidth: s.posterWidth,
    posterHeight: s.posterHeight,
    rotation: s.rotation,
    placementSource: "manual",
    warnings: s.warnings,
  };
}
