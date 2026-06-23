import { openai } from "@workspace/integrations-openai-ai-server";

// ─── Placement model overview ─────────────────────────────────────────────────
//
// Current fields (fully implemented):
//   DetectedPlacementConfig
//     • surfaceType      — poster / frame / paper / unknown
//     • confidence       — 0–1 float from GPT vision
//     • coordinateSystem — always "normalized" (0–1 range)
//     • corners          — quad corners for the placement surface (topLeft…bottomLeft)
//     • boundingBox      — AABB derived from corners or model output (x/y/width/height, 0–1)
//     • rotation         — clockwise degrees (0 = upright)
//     • recommendedFitMode  — cover / contain / stretch
//     • recommendedRender   — shadow/highlight/blur/overlay/borderRadius hints
//     • warnings         — low-confidence, tilt, multiple frames, occlusion notices
//
//   Template table fields (placement source & status):
//     • placementMode    — "manual" | "auto_detected" | "auto_detected_needs_review"
//     • detectedPlacementStatus — "not_analyzed" | "detected" | "needs_review" | "failed"
//     • detectedPlacementConfig — stored DetectedPlacementConfig (JSONB)
//     • detectedPlacementError  — human-readable error string on failure
//     • analyzedAt       — timestamp of last analysis run
//
// Future work (TODOs for the next iteration):
//   TODO: Perspective transform renderer
//         The corners field captures the actual quad of the poster surface (including
//         tilt). A perspective-correct render would warp the poster image into the quad
//         using a homography matrix (e.g. via canvas 2D transform or a WebGL shader)
//         rather than the current simple CSS/Sharp rectangle approach.
//
//   TODO: Mask / foreground occlusion layer
//         Some templates partially occlude the poster surface (e.g. a hand holding a
//         frame, or a plant in front of a wall print). A mask PNG stored alongside the
//         background would let us composite: background → poster → mask → foreground,
//         which prevents the poster from bleeding through foreground objects.
//
//   TODO: Shadow / highlight import layer
//         For photorealistic compositing, import the template-specific shadow and
//         highlight layer (alpha PNG or multiply/screen blend) and apply it on top of
//         the composited poster. Currently shadow/highlight settings are approximated
//         as CSS box-shadow and brightness filters.
//
//   TODO: Visual drag/resize/corner editor
//         Replace the numeric X/Y/W/H input fields with a canvas overlay that lets
//         admins drag the bounding box handles directly on the template image preview.
//         The corner points from DetectedPlacementConfig.corners could drive a
//         4-point drag handle UI for perspective-aware placement.
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
}

export interface PlacementAnalysisResult {
  config: DetectedPlacementConfig | null;
  confidence: number;
  status: "detected" | "needs_review" | "failed";
  error?: string;
}

const DETECTION_MODEL = "gpt-4o";

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
- Significant perspective/tilt (> 10°): "Detected perspective tilt; best-fit rectangle will be used"
- Multiple frames detected: "Multiple frames detected; chose most central"
- Partial occlusion: "Surface may be partially occluded"
- No clear surface: "No clear poster/artwork surface identified"`;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function clampPoint(p: NormalizedPoint): NormalizedPoint {
  return { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
}

function cornersToAabb(corners: DetectedPlacementConfig["corners"]): { x: number; y: number; width: number; height: number } {
  const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x];
  const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);
  return { x, y, width: x2 - x, height: y2 - y };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
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

  const warnings: string[] = Array.isArray(r.warnings) ? r.warnings.filter((w) => typeof w === "string") : [];

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
  if (rawBb && typeof rawBb.x === "number" && typeof rawBb.y === "number" &&
      typeof rawBb.width === "number" && typeof rawBb.height === "number") {
    boundingBox = {
      x: round3(clamp(rawBb.x, 0, 1)),
      y: round3(clamp(rawBb.y, 0, 1)),
      width: round3(clamp(rawBb.width, 0, 1)),
      height: round3(clamp(rawBb.height, 0, 1)),
    };
  } else {
    // Derive from corners
    boundingBox = cornersToAabb(corners);
    Object.assign(boundingBox, {
      x: round3(boundingBox.x),
      y: round3(boundingBox.y),
      width: round3(boundingBox.width),
      height: round3(boundingBox.height),
    });
  }

  // Reject impossible geometry
  if (boundingBox.width <= 0.01 || boundingBox.height <= 0.01) {
    throw new Error("Detected bounding box is too small to be valid");
  }
  if (boundingBox.x + boundingBox.width > 1.01 || boundingBox.y + boundingBox.height > 1.01) {
    throw new Error("Detected bounding box extends outside image bounds");
  }

  const rawRender = r.recommendedRender as Record<string, unknown> | undefined;
  const recommendedRender: DetectedPlacementConfig["recommendedRender"] = {
    shadowOpacity: clamp(typeof rawRender?.shadowOpacity === "number" ? rawRender.shadowOpacity : 0.3, 0, 0.6),
    shadowBlur: clamp(typeof rawRender?.shadowBlur === "number" ? rawRender.shadowBlur : 15, 0, 40),
    highlightOpacity: clamp(typeof rawRender?.highlightOpacity === "number" ? rawRender.highlightOpacity : 0, 0, 0.3),
    overlayOpacity: clamp(typeof rawRender?.overlayOpacity === "number" ? rawRender.overlayOpacity : 0, 0, 0.2),
    borderRadius: clamp(typeof rawRender?.borderRadius === "number" ? rawRender.borderRadius : 0, 0, 20),
  };

  if (confidence < 0.6 && !warnings.some((w) => w.includes("Low confidence"))) {
    warnings.push("Low confidence detection — manual review recommended");
  }
  if (Math.abs(rotation) > 10 && !warnings.some((w) => w.includes("perspective"))) {
    warnings.push("Detected perspective tilt; best-fit rectangle will be used");
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
 * Analyze a mockup template image to detect the poster/frame placement area.
 * Returns a structured DetectedPlacementConfig with normalized coordinates.
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
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "high" },
            },
            {
              type: "text",
              text: "Analyze this mockup background and return the placement JSON.",
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        config: null,
        confidence: 0,
        status: "failed",
        error: "Model did not return JSON",
      };
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
      return {
        config,
        confidence,
        status: "needs_review",
      };
    }

    const status: PlacementAnalysisResult["status"] = confidence >= 0.4 ? "detected" : "needs_review";
    return { config, confidence, status };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    return {
      config: null,
      confidence: 0,
      status: "failed",
      error: msg,
    };
  }
}

/**
 * Resolve the effective placement for a template.
 * Returns placement values in 0-100 percentage space (compositor units).
 */
export function resolveEffectiveMockupPlacement(template: {
  placementMode: string | null;
  detectedPlacementStatus: string | null;
  detectedPlacementConfig: unknown;
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number | null;
}): {
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number;
  placementSource: "auto_detected" | "manual";
  warnings: string[];
} {
  const mode = template.placementMode ?? "manual";
  const status = template.detectedPlacementStatus ?? "not_analyzed";

  if (mode === "auto_detected" && status === "detected" && template.detectedPlacementConfig) {
    try {
      const cfg = template.detectedPlacementConfig as DetectedPlacementConfig;
      const bb = cfg.boundingBox;
      if (bb && typeof bb.x === "number" && typeof bb.y === "number" &&
          typeof bb.width === "number" && typeof bb.height === "number" &&
          bb.width > 0.01 && bb.height > 0.01) {
        const warnings: string[] = cfg.warnings ?? [];
        return {
          posterX: round3(bb.x * 100),
          posterY: round3(bb.y * 100),
          posterWidth: round3(bb.width * 100),
          posterHeight: round3(bb.height * 100),
          rotation: cfg.rotation ?? 0,
          placementSource: "auto_detected",
          warnings,
        };
      }
      // Config present but bounding box invalid — fall through to manual
    } catch {
      // fall through
    }
  }

  return {
    posterX: template.posterX,
    posterY: template.posterY,
    posterWidth: template.posterWidth,
    posterHeight: template.posterHeight,
    rotation: template.rotation ?? 0,
    placementSource: "manual",
    warnings: mode === "auto_detected" ? ["Auto-detected placement unavailable — using manual fallback"] : [],
  };
}
