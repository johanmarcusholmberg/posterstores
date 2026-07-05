import { openai } from "@workspace/integrations-openai-ai-server";
import type { CornerPoints } from "./mockupCompositor";

// ─── Placement / surface model overview ──────────────────────────────────────
//
// User-facing terminology (admin UI):
//   "Poster surface"      — the area where the poster artwork will be inserted.
//   "Detected surface"    — AI-suggested poster surface that needs review.
//   "Manual surface"      — admin-defined poster surface.
//   "Rendered mockup"     — the generated flattened image stored as mockupImageUrl.
//
// Internal DB fields (template table):
//   posterX / posterY / posterWidth / posterHeight — bounding-box surface (0-100%)
//   rotation                    — clockwise degrees
//   placementMode               — "manual" | "auto_detected" | "auto_detected_needs_review"
//   detectedPlacementStatus     — "not_analyzed" | "detected" | "needs_review" | "failed"
//   detectedPlacementConfig     — DetectedPlacementConfig JSONB (corners + bbox + confidence)
//
// Resolution priority (resolveEffectiveMockupSurface):
//   1. placementMode === "auto_detected" + valid corners in detectedPlacementConfig
//      → use corners (perspective render)
//   2. placementMode === "auto_detected" + valid bbox in detectedPlacementConfig
//      → use bbox (rectangle render)
//   3. posterX/Y/Width/Height set
//      → use manual bbox (rectangle render)
//   4. fallback
//      → no surface (sync will skip this template)
//
// Future work:
//   TODO: Mask/occlusion foreground layer
//   TODO: Shadow/highlight import layer
// ─────────────────────────────────────────────────────────────────────────────

export type SurfaceType = "poster" | "frame" | "paper" | "unknown";
export type FitMode = "cover" | "contain" | "stretch";

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface DetectedPlacementConfig {
  surfaceType: SurfaceType;
  confidence: number;
  coordinateSystem: "normalized";
  corners: {
    topLeft: NormalizedPoint;
    topRight: NormalizedPoint;
    bottomRight: NormalizedPoint;
    bottomLeft: NormalizedPoint;
  };
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rotation: number;
  recommendedFitMode: FitMode;
  recommendedRender: {
    shadowOpacity: number;
    shadowBlur: number;
    highlightOpacity: number;
    overlayOpacity: number;
    borderRadius: number;
  };
  warnings: string[];
  /**
   * @deprecated Use the `placement_config` column for manual surfaces.
   * Legacy: "manual_surface" may appear in rows saved before the column was added.
   */
  source?: "ai" | "manual_surface";
}

/**
 * Admin-defined manual poster surface.
 * Stored in the `placement_config` JSONB column — never mixed with AI detection data.
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

export interface PlacementAnalysisResult {
  config: DetectedPlacementConfig | null;
  confidence: number;
  status: "detected" | "needs_review" | "failed";
  error?: string;
}

// ─── Effective surface resolver ───────────────────────────────────────────────

/**
 * How the poster is geometrically composited onto the background.
 * Note: this is NOT the same as template.renderMode ("deterministic" | "ai_rendered").
 */
export type SurfaceGeometryMode = "corners" | "bounding_box";
/** @deprecated Use SurfaceGeometryMode */
export type SurfaceRenderMode = SurfaceGeometryMode;

export type SurfaceSource =
  | "auto_detected_corners"
  | "auto_detected_bbox"
  | "manual_corners"
  | "manual_bbox"
  | "fallback";

/**
 * Resolved poster surface, ready for the compositor.
 * When `geometryMode === "corners"`, use `corners` + `compositePosterWithCorners`.
 * When `geometryMode === "bounding_box"`, use `posterX/Y/Width/Height` + `compositePosterIntoTemplate`.
 *
 * Note: `geometryMode` here is distinct from the template's `renderMode` field
 * ("deterministic" | "ai_rendered"), which controls the renderer pipeline.
 */
export interface EffectiveMockupSurface {
  geometryMode: SurfaceGeometryMode;
  corners: CornerPoints | null;
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number;
  fitMode: string | null;
  surfaceSource: SurfaceSource;
  warnings: string[];
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

/** Convert four corners to an axis-aligned bounding box (0-100% scale). */
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

/** Normalize corners to pixel space using image dimensions. */
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

/** Convert normalized corners to pixel coordinates. */
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
    case "auto_detected_corners": return "Detected surface (corners, perspective)";
    case "auto_detected_bbox": return "Detected surface (bounding box)";
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
 *   1. placementMode === "auto_detected" + valid detectedPlacementConfig (AI only)
 *   2. placementConfig with valid corners (admin manual surface column)
 *   3. placementConfig with valid bounding box
 *   4. Legacy: detectedPlacementConfig with source="manual_surface" (backward compat)
 *   5. Legacy: posterX/Y/Width/Height scalar fields
 *   6. Fallback (no surface — sync will skip this template)
 *
 * User-facing name: "Poster surface".
 */
export function resolveEffectiveMockupSurface(template: {
  placementMode: string | null;
  detectedPlacementStatus: string | null;
  detectedPlacementConfig: unknown;
  /** Admin-defined manual surface (placement_config column). */
  placementConfig?: unknown;
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number | null;
  fitMode?: string | null;
}): EffectiveMockupSurface {
  const mode = template.placementMode ?? "manual";
  const status = template.detectedPlacementStatus ?? "not_analyzed";

  // ── Priority 1: AI-approved detected surface ──────────────────────────────
  // Only active when admin has set placementMode = "auto_detected".
  // detectedPlacementConfig must contain pure AI data (not legacy manual_surface rows).
  if (mode === "auto_detected" && status === "detected" && template.detectedPlacementConfig) {
    try {
      const cfg = template.detectedPlacementConfig as DetectedPlacementConfig;
      // Skip legacy rows that were wrongly written to this column
      if (cfg.source !== "manual_surface") {
        const c = cfg.corners;
        if (c?.topLeft && c.topRight && c.bottomRight && c.bottomLeft) {
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
              rotation: cfg.rotation ?? 0,
              fitMode: cfg.recommendedFitMode ?? template.fitMode ?? null,
              surfaceSource: geometryMode === "corners" ? "auto_detected_corners" : "auto_detected_bbox",
              warnings: [...(cfg.warnings ?? [])],
            };
          }
        }
        // Fall back to detected bounding box
        const bb = cfg.boundingBox;
        if (bb && typeof bb.x === "number" && typeof bb.y === "number" &&
            typeof bb.width === "number" && typeof bb.height === "number" &&
            bb.width > 0.01 && bb.height > 0.01) {
          return {
            geometryMode: "bounding_box",
            corners: null,
            posterX: round3(bb.x * 100),
            posterY: round3(bb.y * 100),
            posterWidth: round3(bb.width * 100),
            posterHeight: round3(bb.height * 100),
            rotation: cfg.rotation ?? 0,
            fitMode: cfg.recommendedFitMode ?? template.fitMode ?? null,
            surfaceSource: "auto_detected_bbox",
            warnings: [...(cfg.warnings ?? [])],
          };
        }
      }
    } catch {
      // fall through
    }
  }

  // ── Priority 2 & 3: Admin-defined manual surface (placement_config column) ─
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
              fitMode: mc.fitMode ?? template.fitMode ?? null,
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
              fitMode: mc.fitMode ?? template.fitMode ?? null,
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

  // ── Priority 4: Legacy — manual_surface saved in detectedPlacementConfig ──
  // Backward compat for rows written before the placement_config column existed.
  if (template.detectedPlacementConfig) {
    try {
      const cfg = template.detectedPlacementConfig as DetectedPlacementConfig;
      if (cfg.source === "manual_surface") {
        const c = cfg.corners;
        if (c?.topLeft && c.topRight && c.bottomRight && c.bottomLeft) {
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
              rotation: cfg.rotation ?? 0,
              fitMode: cfg.recommendedFitMode ?? template.fitMode ?? null,
              surfaceSource: geometryMode === "corners" ? "manual_corners" : "manual_bbox",
              warnings: ["Legacy: surface was saved in the AI detection column. Re-save via the corner editor to migrate."],
            };
          }
        }
      }
    } catch {
      // fall through
    }
  }

  // ── Priority 5: Legacy manual bounding box (posterX/Y/Width/Height fields) ─
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
      fitMode: template.fitMode ?? null,
      surfaceSource: "manual_bbox",
      warnings:
        mode === "auto_detected"
          ? ["Auto-detected surface unavailable — using manual bounding box fallback"]
          : [],
    };
  }

  // ── Priority 6: No valid surface ─────────────────────────────────────────
  return {
    geometryMode: "bounding_box",
    corners: null,
    posterX: null,
    posterY: null,
    posterWidth: null,
    posterHeight: null,
    rotation: template.rotation ?? 0,
    fitMode: template.fitMode ?? null,
    surfaceSource: "fallback",
    warnings: ["No poster surface defined — skipping sync for this template"],
  };
}

/**
 * Backwards-compatible wrapper. Returns the same shape as the old
 * `resolveEffectiveMockupPlacement` function for callers that haven't been
 * updated to the new surface API.
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
    placementSource: s.surfaceSource.startsWith("auto") ? "auto_detected" : "manual",
    warnings: s.warnings,
  };
}

// ─── AI detection ─────────────────────────────────────────────────────────────

const DETECTION_MODEL = "gpt-5";

const SYSTEM_PROMPT = `You are a computer vision expert specializing in identifying poster/artwork placement surfaces in interior mockup images for a print shop.

Your task: Analyze the mockup background image and locate the exact area where a poster artwork should be composited.

Look for:
- An empty picture frame (wood, metal, black, white)
- A blank canvas or art board mounted on a wall
- A designated art display area or mat opening
- A whiteboard or corkboard intended for artwork
- A flat wall surface with a clearly defined poster zone

OUTPUT RULES:
- Return ONLY valid JSON. No prose, no explanation, no markdown.
- All coordinate values MUST be in normalized 0.0–1.0 range (fraction of image dimensions).
- x=0, y=0 is top-left; x=1, y=1 is bottom-right.
- If multiple frames exist, choose the most central or largest intended poster surface.
- If no clear surface, set confidence below 0.4 and surfaceType to "unknown".

Return this exact JSON structure:
{
  "surfaceType": "poster" | "frame" | "paper" | "unknown",
  "confidence": <0.0-1.0>,
  "coordinateSystem": "normalized",
  "corners": {
    "topLeft": { "x": <0-1>, "y": <0-1> },
    "topRight": { "x": <0-1>, "y": <0-1> },
    "bottomRight": { "x": <0-1>, "y": <0-1> },
    "bottomLeft": { "x": <0-1>, "y": <0-1> }
  },
  "boundingBox": {
    "x": <left edge 0-1>,
    "y": <top edge 0-1>,
    "width": <0-1>,
    "height": <0-1>
  },
  "rotation": <clockwise degrees, 0 if upright>,
  "recommendedFitMode": "cover" | "contain" | "stretch",
  "recommendedRender": {
    "shadowOpacity": <0-0.6>,
    "shadowBlur": <0-40>,
    "highlightOpacity": <0-0.3>,
    "overlayOpacity": <0-0.2>,
    "borderRadius": <0-20>
  },
  "warnings": [<string>, ...]
}

Add warnings for:
- Low confidence (< 0.6): "Low confidence detection — manual review recommended"
- Significant perspective/tilt (> 10°): "Detected perspective tilt; perspective renderer will warp poster into surface"
- Multiple frames detected: "Multiple frames detected; chose most central"
- Partial occlusion: "Surface may be partially occluded"
- No clear surface: "No clear poster/artwork surface identified"`;

function clampPoint(p: NormalizedPoint): NormalizedPoint {
  return { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
}

function cornersToAabb(
  corners: DetectedPlacementConfig["corners"]
): { x: number; y: number; width: number; height: number } {
  const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x];
  const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);
  return { x, y, width: x2 - x, height: y2 - y };
}

function validateAndNormalize(raw: unknown): DetectedPlacementConfig {
  if (!raw || typeof raw !== "object") throw new Error("Response is not an object");
  const r = raw as Record<string, unknown>;

  const confidence = clamp(typeof r.confidence === "number" ? r.confidence : 0, 0, 1);
  const surfaceType: SurfaceType = ["poster", "frame", "paper"].includes(r.surfaceType as string)
    ? (r.surfaceType as SurfaceType)
    : "unknown";

  const rotation = typeof r.rotation === "number" ? r.rotation : 0;
  const fitModes: FitMode[] = ["cover", "contain", "stretch"];
  const recommendedFitMode: FitMode = fitModes.includes(r.recommendedFitMode as FitMode)
    ? (r.recommendedFitMode as FitMode)
    : "cover";

  const warnings: string[] = Array.isArray(r.warnings)
    ? r.warnings.filter((w) => typeof w === "string")
    : [];

  const rawCorners = r.corners as Record<string, unknown> | undefined;
  const parsePoint = (p: unknown): NormalizedPoint => {
    if (!p || typeof p !== "object") return { x: 0, y: 0 };
    const pt = p as Record<string, unknown>;
    return clampPoint({
      x: typeof pt.x === "number" ? round3(pt.x) : 0,
      y: typeof pt.y === "number" ? round3(pt.y) : 0,
    });
  };

  const corners: DetectedPlacementConfig["corners"] = {
    topLeft: parsePoint(rawCorners?.topLeft),
    topRight: parsePoint(rawCorners?.topRight),
    bottomRight: parsePoint(rawCorners?.bottomRight),
    bottomLeft: parsePoint(rawCorners?.bottomLeft),
  };

  let boundingBox: DetectedPlacementConfig["boundingBox"];
  const rawBb = r.boundingBox as Record<string, unknown> | undefined;
  if (
    rawBb &&
    typeof rawBb.x === "number" &&
    typeof rawBb.y === "number" &&
    typeof rawBb.width === "number" &&
    typeof rawBb.height === "number"
  ) {
    boundingBox = {
      x: round3(clamp(rawBb.x, 0, 1)),
      y: round3(clamp(rawBb.y, 0, 1)),
      width: round3(clamp(rawBb.width, 0, 1)),
      height: round3(clamp(rawBb.height, 0, 1)),
    };
  } else {
    const aabb = cornersToAabb(corners);
    boundingBox = {
      x: round3(aabb.x),
      y: round3(aabb.y),
      width: round3(aabb.width),
      height: round3(aabb.height),
    };
  }

  if (boundingBox.width <= 0.01 || boundingBox.height <= 0.01) {
    throw new Error("Detected bounding box is too small to be valid");
  }
  if (boundingBox.x + boundingBox.width > 1.01 || boundingBox.y + boundingBox.height > 1.01) {
    throw new Error("Detected bounding box extends outside image bounds");
  }

  const rawRender = r.recommendedRender as Record<string, unknown> | undefined;
  const recommendedRender: DetectedPlacementConfig["recommendedRender"] = {
    shadowOpacity: clamp(
      typeof rawRender?.shadowOpacity === "number" ? rawRender.shadowOpacity : 0.3,
      0,
      0.6
    ),
    shadowBlur: clamp(typeof rawRender?.shadowBlur === "number" ? rawRender.shadowBlur : 15, 0, 40),
    highlightOpacity: clamp(
      typeof rawRender?.highlightOpacity === "number" ? rawRender.highlightOpacity : 0,
      0,
      0.3
    ),
    overlayOpacity: clamp(
      typeof rawRender?.overlayOpacity === "number" ? rawRender.overlayOpacity : 0,
      0,
      0.2
    ),
    borderRadius: clamp(
      typeof rawRender?.borderRadius === "number" ? rawRender.borderRadius : 0,
      0,
      20
    ),
  };

  if (confidence < 0.6 && !warnings.some((w) => w.includes("Low confidence"))) {
    warnings.push("Low confidence detection — manual review recommended");
  }
  if (Math.abs(rotation) > 10 && !warnings.some((w) => w.includes("perspective"))) {
    warnings.push("Detected perspective tilt; perspective renderer will warp poster into surface");
  }

  return {
    surfaceType,
    confidence,
    coordinateSystem: "normalized",
    corners,
    boundingBox,
    rotation,
    recommendedFitMode,
    recommendedRender,
    warnings,
    source: "ai",
  };
}

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isPrivateOrLocalUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return PRIVATE_IP_PATTERNS.some((re) => re.test(parsed.hostname));
  } catch {
    return true;
  }
}

/**
 * Analyze a mockup template image to detect the poster surface area.
 * Returns a structured DetectedPlacementConfig with normalized coordinates and corners.
 */
export async function analyzeMockupPlacement(imageUrl: string): Promise<PlacementAnalysisResult> {
  if (isPrivateOrLocalUrl(imageUrl)) {
    return {
      config: null,
      confidence: 0,
      status: "failed",
      error: "Image URL must point to a publicly accessible host",
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: DETECTION_MODEL,
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: "Analyze this mockup background and return the poster surface JSON." },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { config: null, confidence: 0, status: "failed", error: "Model did not return JSON" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return {
        config: null,
        confidence: 0,
        status: "failed",
        error: "Could not parse model JSON response",
      };
    }

    const config = validateAndNormalize(parsed);
    const { confidence } = config;

    if (confidence < 0.4 && config.surfaceType === "unknown") {
      return { config, confidence, status: "needs_review" };
    }

    const status: PlacementAnalysisResult["status"] = confidence >= 0.4 ? "detected" : "needs_review";
    return { config, confidence, status };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    return { config: null, confidence: 0, status: "failed", error: msg };
  }
}
