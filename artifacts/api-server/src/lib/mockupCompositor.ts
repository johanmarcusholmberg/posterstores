import sharp from "sharp";
import { ObjectStorageService } from "./objectStorage";
import { safeFetchBuffer } from "./safeImageUrl";

const storage = new ObjectStorageService();

// ─── Size and pixel limits ────────────────────────────────────────────────────

/** Maximum bytes to download for any single image (50 MB). */
export const MAX_IMAGE_DOWNLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Maximum decoded pixel count accepted by Sharp (80 MP ≈ 8000×10000).
 * Passed as `limitInputPixels` to every Sharp instance that decodes
 * externally-supplied image data.
 */
export const MAX_DECODED_IMAGE_PIXELS = 80_000_000;

// ─── Backwards-compatible interface declarations ──────────────────────────────
//
// These interfaces are preserved so existing call sites compile without changes.
// The rendering logic now routes through the unified `renderMockup` pipeline.

export interface CompositorConfig {
  posterX: number;
  posterY: number;
  posterWidth: number;
  posterHeight: number;
  rotation?: number | null;
  fitMode?: string | null;
  borderRadius?: number | null;
  brightness?: number | null;
  contrast?: number | null;
  saturation?: number | null;
}

/** Normalized (0–1) four-corner surface definition. */
export interface CornerPoints {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface PerspectiveCompositorConfig {
  corners: CornerPoints;
  fitMode?: string | null;
  borderRadius?: number | null;
  brightness?: number | null;
  contrast?: number | null;
  saturation?: number | null;
}

export interface PerspectiveCompositorResult {
  buffer: Buffer;
  /** Non-null when the renderer fell back from perspective to bounding-box. */
  surfaceWarning?: string;
}

export interface LayeredCompositorConfig extends CompositorConfig {
  lightingOverlayUrl?: string | null;
  foregroundImageUrl?: string | null;
  lightingBlendMode?: string | null;
  lightingOpacity?: number | null;
  foregroundOpacity?: number | null;
  useBase?: boolean;
  useLightingOverlay?: boolean;
  useForeground?: boolean;
}

// ─── Unified render API ───────────────────────────────────────────────────────

export interface BboxSurface {
  mode: "bbox";
  posterX: number;   // percentage 0–100
  posterY: number;
  posterWidth: number;
  posterHeight: number;
  rotation?: number | null;
  borderRadius?: number | null;
  fitMode?: string | null;
}

export interface CornersSurface {
  mode: "corners";
  corners: CornerPoints;
  borderRadius?: number | null;
  fitMode?: string | null;
}

export type RenderSurface = BboxSurface | CornersSurface;

export interface PosterAdjustments {
  brightness?: number | null;
  contrast?: number | null;
  saturation?: number | null;
}

/**
 * Full options for the unified mockup renderer.
 *
 * Layer render order:
 *   1. Base image (or white canvas when useBase = false)
 *   2. Adjusted poster artwork (adjustments applied only to the poster)
 *   3. Effects overlay (when useLightingOverlay !== false and effectsOverlayUrl is set)
 *   4. Foreground layer (when useForeground !== false and foregroundImageUrl is set)
 *   5. Single final JPEG encode via encodeResultAsJpeg
 */
export interface RenderMockupOptions {
  templateImageUrl: string;
  posterImageUrl: string;
  surface: RenderSurface;
  /** Brightness, contrast, saturation applied to the poster only — not the base. */
  adjustments?: PosterAdjustments;
  effectsOverlayUrl?: string | null;
  foregroundImageUrl?: string | null;
  effectsBlendMode?: string | null;
  effectsOpacity?: number | null;
  foregroundOpacity?: number | null;
  useBase?: boolean;
  useLightingOverlay?: boolean;
  useForeground?: boolean;
}

export interface RenderMockupResult {
  buffer: Buffer;
  /** Set when perspective warp fell back to bounding-box rendering. */
  surfaceWarning?: string;
}

// ─── Image loading ────────────────────────────────────────────────────────────

function getInternalObjectPath(source: string): string | null {
  const trimmed = source.trim();
  if (trimmed.startsWith("/objects/")) return trimmed;
  const storageApiPrefix = "/api/storage";
  if (trimmed.startsWith(`${storageApiPrefix}/objects/`)) {
    return trimmed.slice(storageApiPrefix.length);
  }
  return null;
}

/**
 * Fetch an image from a storage object path or external URL.
 *
 * Internal paths (/api/storage/objects/… or /objects/…) are fetched directly
 * from object storage. External URLs are fetched through the SSRF-safe loader
 * which enforces DNS validation, redirect limits, and streaming byte limits.
 *
 * @param source   - Internal path or external http(s) URL.
 * @param maxBytes - Hard byte limit. Defaults to MAX_IMAGE_DOWNLOAD_BYTES.
 */
export async function fetchImageBuffer(source: string, maxBytes?: number): Promise<Buffer> {
  const limit = maxBytes ?? MAX_IMAGE_DOWNLOAD_BYTES;
  const trimmed = source.trim();
  const internalObjectPath = getInternalObjectPath(trimmed);

  if (internalObjectPath) {
    const file = await storage.getObjectEntityFile(internalObjectPath);
    const [buffer] = await file.download();
    if (buffer.byteLength > limit) {
      throw new Error(
        `Image is too large (${Math.round(buffer.byteLength / 1024 / 1024)} MB). ` +
        `Maximum allowed size is ${Math.round(limit / 1024 / 1024)} MB.`
      );
    }
    return buffer;
  }

  // External URL — SSRF-safe streaming fetch with DNS validation and redirect control
  return safeFetchBuffer(trimmed, limit);
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function buildRoundedMask(w: number, h: number, r: number): Buffer {
  const rx = Math.min(r, w / 2, h / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="white"/>
  </svg>`;
  return Buffer.from(svg);
}

/** Derive an axis-aligned bounding box from four normalized corners. */
export function cornersToBoundingBox(
  corners: CornerPoints
): { x: number; y: number; width: number; height: number } {
  const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x];
  const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Returns true when corners form a near-axis-aligned rectangle
 * (i.e. perspective warp would not meaningfully differ from a bbox render).
 */
export function isRectangularCorners(corners: CornerPoints, tolerance = 0.005): boolean {
  const { topLeft: TL, topRight: TR, bottomRight: BR, bottomLeft: BL } = corners;
  return (
    Math.abs(TL.y - TR.y) < tolerance &&
    Math.abs(BL.y - BR.y) < tolerance &&
    Math.abs(TL.x - BL.x) < tolerance &&
    Math.abs(TR.x - BR.x) < tolerance
  );
}

function normalizeFitMode(fitStr: string | null | undefined): "cover" | "contain" | "stretch" {
  if (fitStr === "contain") return "contain";
  if (fitStr === "stretch") return "stretch";
  return "cover";
}

const VALID_BLEND_MODES = ["multiply", "screen", "overlay", "soft-light", "over"] as const;
type LayerBlendMode = typeof VALID_BLEND_MODES[number];

function normalizeBlendMode(mode: string | null | undefined): LayerBlendMode {
  if (mode && (VALID_BLEND_MODES as readonly string[]).includes(mode)) {
    return mode as LayerBlendMode;
  }
  return "multiply";
}

// ─── Perspective warp math ────────────────────────────────────────────────────

function solveLinear8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    if (Math.abs(M[maxRow][col]) < 1e-10) return null;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / pivot;
      for (let c = col; c <= n; c++) M[row][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function computeHomography(
  src: [number, number][],
  dst: [number, number][]
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [xp, yp] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * xp, -y * xp]);
    b.push(xp);
    A.push([0, 0, 0, x, y, 1, -x * yp, -y * yp]);
    b.push(yp);
  }
  const h = solveLinear8(A, b);
  return h ? [...h, 1] : null;
}

function invertMatrix3x3(H: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, k] = H;
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const di = 1 / det;
  return [
    (e * k - f * h) * di, (c * h - b * k) * di, (b * f - c * e) * di,
    (f * g - d * k) * di, (a * k - c * g) * di, (c * d - a * f) * di,
    (d * h - e * g) * di, (b * g - a * h) * di, (a * e - b * d) * di,
  ];
}

function applyH(H: number[], px: number, py: number): [number, number] {
  const w = H[6] * px + H[7] * py + H[8];
  if (Math.abs(w) < 1e-10) return [-1, -1];
  return [(H[0] * px + H[1] * py + H[2]) / w, (H[3] * px + H[4] * py + H[5]) / w];
}

// ─── Perspective warp core ────────────────────────────────────────────────────

/**
 * Warp posterBuf into the destination quadrilateral on a template-sized canvas
 * using inverse perspective mapping + bilinear sampling.
 *
 * Accepts the already-adjusted (brightness/contrast/saturation applied) poster
 * buffer. Returns a transparent PNG (templateW × templateH) with only the warped
 * poster pixels filled in. Returns null if the homography cannot be computed.
 */
async function perspectiveWarpPoster(
  adjustedPosterBuf: Buffer,
  corners: CornerPoints,
  templateW: number,
  templateH: number,
  fitMode: "cover" | "contain" | "stretch"
): Promise<Buffer | null> {
  const TL: [number, number] = [corners.topLeft.x * templateW, corners.topLeft.y * templateH];
  const TR: [number, number] = [corners.topRight.x * templateW, corners.topRight.y * templateH];
  const BR: [number, number] = [corners.bottomRight.x * templateW, corners.bottomRight.y * templateH];
  const BL: [number, number] = [corners.bottomLeft.x * templateW, corners.bottomLeft.y * templateH];

  const minX = Math.max(0, Math.floor(Math.min(TL[0], TR[0], BR[0], BL[0])));
  const maxX = Math.min(templateW - 1, Math.ceil(Math.max(TL[0], TR[0], BR[0], BL[0])));
  const minY = Math.max(0, Math.floor(Math.min(TL[1], TR[1], BR[1], BL[1])));
  const maxY = Math.min(templateH - 1, Math.ceil(Math.max(TL[1], TR[1], BR[1], BL[1])));

  if (maxX <= minX || maxY <= minY) return null;

  const bbW = maxX - minX + 1;
  const bbH = maxY - minY + 1;

  const sharpFit: "cover" | "contain" | "fill" =
    fitMode === "stretch" ? "fill" : fitMode === "contain" ? "contain" : "cover";

  const { data: posterRgba, info } = await sharp(adjustedPosterBuf, { limitInputPixels: MAX_DECODED_IMAGE_PIXELS })
    .resize(bbW, bbH, { fit: sharpFit, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sampW = info.width;
  const sampH = info.height;

  const src: [number, number][] = [[0, 0], [sampW, 0], [sampW, sampH], [0, sampH]];
  const dst: [number, number][] = [TL, TR, BR, BL];

  const H = computeHomography(src, dst);
  if (!H) return null;
  const H_inv = invertMatrix3x3(H);
  if (!H_inv) return null;

  const outBuf = Buffer.alloc(templateW * templateH * 4, 0);

  for (let qy = minY; qy <= maxY; qy++) {
    for (let qx = minX; qx <= maxX; qx++) {
      const [sx, sy] = applyH(H_inv, qx + 0.5, qy + 0.5);
      if (sx < 0 || sy < 0 || sx >= sampW || sy >= sampH) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, sampW - 1);
      const y1 = Math.min(y0 + 1, sampH - 1);
      const tx = sx - x0;
      const ty = sy - y0;

      const i00 = (y0 * sampW + x0) * 4;
      const i10 = (y0 * sampW + x1) * 4;
      const i01 = (y1 * sampW + x0) * 4;
      const i11 = (y1 * sampW + x1) * 4;
      const out = (qy * templateW + qx) * 4;

      for (let c = 0; c < 4; c++) {
        outBuf[out + c] = Math.round(
          posterRgba[i00 + c] * (1 - tx) * (1 - ty) +
          posterRgba[i10 + c] * tx * (1 - ty) +
          posterRgba[i01 + c] * (1 - tx) * ty +
          posterRgba[i11 + c] * tx * ty
        );
      }
    }
  }

  return sharp(outBuf, { raw: { width: templateW, height: templateH, channels: 4 } })
    .png()
    .toBuffer();
}

// ─── Poster-only adjustments ──────────────────────────────────────────────────

/**
 * Apply brightness, contrast, and saturation adjustments to the poster artwork
 * ONLY. These must be applied before the poster is placed into the scene so that
 * the base image, frame, and overlay layers are never affected.
 *
 * Neutral values (brightness=1, contrast=1, saturation=1) are treated as no-ops.
 */
export async function applyAdjustmentsToPoster(
  posterBuf: Buffer,
  adjustments: PosterAdjustments | undefined
): Promise<Buffer> {
  const { brightness, contrast, saturation } = adjustments ?? {};
  const needsMod =
    (brightness != null && brightness !== 1) ||
    (saturation != null && saturation !== 1);
  const needsLinear = contrast != null && contrast !== 1;

  if (!needsMod && !needsLinear) return posterBuf;

  let s = sharp(posterBuf, { limitInputPixels: MAX_DECODED_IMAGE_PIXELS });

  if (needsMod) {
    const mod: { brightness?: number; saturation?: number } = {};
    if (brightness != null && brightness !== 1) mod.brightness = brightness;
    if (saturation != null && saturation !== 1) mod.saturation = saturation;
    s = s.modulate(mod);
  }

  if (needsLinear) {
    const c = contrast!;
    const offset = Math.round(128 * (1 - c));
    s = s.linear(c, offset);
  }

  return s.png().toBuffer();
}

// ─── Poster preparation (resize + rotation + border radius) ──────────────────

/**
 * Resize, rotate, and apply border radius to the already-adjusted poster buffer,
 * producing a PNG ready to be composited into the placement area.
 */
async function preparePosterForBbox(
  adjustedPosterBuf: Buffer,
  areaW: number,
  areaH: number,
  opts: { rotation?: number | null; borderRadius?: number | null; fitMode?: string | null }
): Promise<Buffer> {
  const fitMode = normalizeFitMode(opts.fitMode);
  const sharpFit: "cover" | "contain" | "fill" =
    fitMode === "stretch" ? "fill" : fitMode === "contain" ? "contain" : "cover";

  let s = sharp(adjustedPosterBuf, { limitInputPixels: MAX_DECODED_IMAGE_PIXELS }).resize(areaW, areaH, {
    fit: sharpFit,
    withoutEnlargement: false,
  });

  if (opts.rotation) {
    s = s
      .rotate(opts.rotation, { background: { r: 0, g: 0, b: 0, a: 0 } })
      .resize(areaW, areaH, { fit: "cover" });
  }

  const borderRadiusPx =
    opts.borderRadius != null && opts.borderRadius > 0
      ? Math.round((opts.borderRadius / 100) * Math.min(areaW, areaH))
      : 0;

  let posterBuf = await s.png().toBuffer();

  if (borderRadiusPx > 0) {
    const { width: pw = areaW, height: ph = areaH } = await sharp(posterBuf).metadata();
    const maskSvg = buildRoundedMask(pw, ph, borderRadiusPx);
    posterBuf = await sharp(posterBuf)
      .composite([{ input: maskSvg, blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  return posterBuf;
}

// ─── Layer overlay helper ─────────────────────────────────────────────────────

/**
 * Fetch an overlay image, assert its dimensions match the raw base image,
 * resize to canvas dimensions (which may be scaled for corners mode), and apply opacity.
 *
 * @param rawBaseW - Raw base image width (before any canvas scaling). Used for dimension check.
 * @param rawBaseH - Raw base image height. Used for dimension check.
 * @param layerName - Human-readable layer name for error messages ("Effects overlay" / "Foreground").
 */
async function fetchAndPrepareOverlay(
  url: string,
  targetW: number,
  targetH: number,
  opacity: number,
  rawBaseW: number,
  rawBaseH: number,
  layerName: string
): Promise<Buffer> {
  const raw = await fetchImageBuffer(url);

  // ── Dimension enforcement ────────────────────────────────────────────────────
  // The overlay must exactly match the raw base image dimensions.
  // (The canvas may be scaled down for corners mode, but the ratio is preserved,
  //  so the resize below is safe.)
  const overlayMeta = await sharp(raw, { limitInputPixels: MAX_DECODED_IMAGE_PIXELS }).metadata();
  if (overlayMeta.width !== rawBaseW || overlayMeta.height !== rawBaseH) {
    throw new Error(
      `${layerName} dimensions must match Base image dimensions exactly. ` +
      `Overlay is ${overlayMeta.width}×${overlayMeta.height} px, ` +
      `but Base image is ${rawBaseW}×${rawBaseH} px.`
    );
  }

  const { data, info } = await sharp(raw)
    .resize(targetW, targetH, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (opacity < 1) {
    const buf = Buffer.from(data);
    for (let i = 3; i < buf.length; i += 4) {
      buf[i] = Math.round(buf[i] * opacity);
    }
    return sharp(buf, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ─── Final JPEG encoder ───────────────────────────────────────────────────────

/**
 * The single point of JPEG encoding for all mockup renders.
 *
 * All intermediate compositing steps use PNG buffers to avoid lossy
 * recompression. Only this function produces the final JPEG output.
 * It is exported so tests can verify it is called exactly once per render.
 */
export function encodeResultAsJpeg(buf: Buffer): Promise<Buffer> {
  return sharp(buf).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

// ─── Unified render pipeline ──────────────────────────────────────────────────

/**
 * Render a mockup by compositing a poster into a template using one consistent
 * layer pipeline for both bounding-box and perspective placement modes.
 *
 * Render order:
 *   1. Base image (or white canvas when useBase = false)
 *   2. Adjusted poster artwork (adjustments applied ONLY to the poster)
 *   3. Effects overlay (optional: useLightingOverlay !== false + effectsOverlayUrl set)
 *   4. Foreground layer  (optional: useForeground    !== false + foregroundImageUrl set)
 *   5. Single final JPEG encode via encodeResultAsJpeg
 *
 * Intermediate states are kept as PNG buffers — no JPEG re-encoding until step 5.
 *
 * Layer failures throw descriptive errors so the caller (mockupSync) can mark
 * the mockup as failed with a clear reason. A missing URL for a disabled layer
 * is not treated as an error.
 */
export async function renderMockup(opts: RenderMockupOptions): Promise<RenderMockupResult> {
  // ── 1. Load images ──────────────────────────────────────────────────────────
  const [rawTemplateBuf, rawPosterBuf] = await Promise.all([
    fetchImageBuffer(opts.templateImageUrl),
    fetchImageBuffer(opts.posterImageUrl),
  ]);

  // ── 2. Compute working dimensions ───────────────────────────────────────────
  //
  // Corners mode is capped at 2000 px on the longest edge to bound memory use
  // during the O(W×H) perspective warp. Bounding-box mode uses the full size.
  const rawMeta = await sharp(rawTemplateBuf, { limitInputPixels: MAX_DECODED_IMAGE_PIXELS }).metadata();
  const rawW = rawMeta.width ?? 1000;
  const rawH = rawMeta.height ?? 1000;

  const MAX_DIM = 2000;
  const scale =
    opts.surface.mode === "corners"
      ? Math.min(1, MAX_DIM / Math.max(rawW, rawH))
      : 1;
  const W = Math.round(rawW * scale);
  const H = Math.round(rawH * scale);

  // ── 3. Resolve base canvas ──────────────────────────────────────────────────
  let baseBuf: Buffer;
  if (opts.useBase === false) {
    // White canvas — template is still fetched above for dimension lookup.
    baseBuf = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
  } else if (scale < 1) {
    baseBuf = await sharp(rawTemplateBuf, { limitInputPixels: MAX_DECODED_IMAGE_PIXELS }).resize(W, H).png().toBuffer();
  } else {
    baseBuf = rawTemplateBuf;
  }

  // ── 4. Apply adjustments to poster artwork only ─────────────────────────────
  const adjustedPosterBuf = await applyAdjustmentsToPoster(rawPosterBuf, opts.adjustments);

  // ── 5. Place poster onto base canvas ───────────────────────────────────────
  let workingBuf: Buffer;
  let surfaceWarning: string | undefined;

  if (opts.surface.mode === "corners") {
    const { corners, fitMode: fitStr, borderRadius } = opts.surface;
    const fitMode = normalizeFitMode(fitStr);

    let warpedPng: Buffer | null = null;
    try {
      warpedPng = await perspectiveWarpPoster(adjustedPosterBuf, corners, W, H, fitMode);
    } catch (err) {
      surfaceWarning = `Perspective warp error (${
        err instanceof Error ? err.message : "unknown"
      }) — falling back to bounding-box render`;
    }

    if (!warpedPng) {
      if (!surfaceWarning) {
        surfaceWarning =
          "Perspective surface configured, but renderer fell back to rectangle. (Homography degenerate or corners too close.)";
      }
      // Fallback to bounding-box using the axis-aligned bounding box of the corners.
      const bb = cornersToBoundingBox(corners);
      const fbAreaW = Math.round(bb.width * W);
      const fbAreaH = Math.round(bb.height * H);
      const fbLeft = Math.round(bb.x * W);
      const fbTop = Math.round(bb.y * H);
      if (fbAreaW <= 0 || fbAreaH <= 0) {
        throw new Error(`Invalid fallback placement area: ${fbAreaW}x${fbAreaH}`);
      }
      const preparedPoster = await preparePosterForBbox(adjustedPosterBuf, fbAreaW, fbAreaH, {
        fitMode: fitStr,
        borderRadius,
      });
      workingBuf = await sharp(baseBuf)
        .composite([{ input: preparedPoster, left: fbLeft, top: fbTop, blend: "over" }])
        .png()
        .toBuffer();
    } else {
      workingBuf = await sharp(baseBuf)
        .composite([{ input: warpedPng, blend: "over" }])
        .png()
        .toBuffer();
    }
  } else {
    // Bounding-box placement
    const { posterX, posterY, posterWidth, posterHeight, rotation, borderRadius, fitMode } =
      opts.surface;
    const areaLeft = Math.round((posterX / 100) * W);
    const areaTop = Math.round((posterY / 100) * H);
    const areaW = Math.round((posterWidth / 100) * W);
    const areaH = Math.round((posterHeight / 100) * H);

    if (areaW <= 0 || areaH <= 0) {
      throw new Error(`Invalid placement area: ${areaW}x${areaH}`);
    }

    const preparedPoster = await preparePosterForBbox(adjustedPosterBuf, areaW, areaH, {
      rotation,
      borderRadius,
      fitMode,
    });

    workingBuf = await sharp(baseBuf)
      .composite([{ input: preparedPoster, left: areaLeft, top: areaTop, blend: "over" }])
      .png()
      .toBuffer();
  }

  // ── 6. Effects overlay ──────────────────────────────────────────────────────
  //
  // A layer is considered "active" when its use flag is not explicitly false AND
  // its URL is set. A missing URL for a non-active layer is never an error.
  const applyEffects = opts.useLightingOverlay !== false && !!opts.effectsOverlayUrl;
  if (applyEffects) {
    try {
      const blendMode = normalizeBlendMode(opts.effectsBlendMode);
      const opacity = Math.max(0, Math.min(1, opts.effectsOpacity ?? 0.8));
      const overlayBuf = await fetchAndPrepareOverlay(opts.effectsOverlayUrl!, W, H, opacity, rawW, rawH, "Effects overlay");
      workingBuf = await sharp(workingBuf)
        .composite([{ input: overlayBuf, blend: blendMode }])
        .png()
        .toBuffer();
    } catch (err) {
      throw new Error(
        `Failed to load effects overlay: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── 7. Foreground layer ─────────────────────────────────────────────────────
  const applyForeground = opts.useForeground !== false && !!opts.foregroundImageUrl;
  if (applyForeground) {
    try {
      const opacity = Math.max(0, Math.min(1, opts.foregroundOpacity ?? 1.0));
      const fgBuf = await fetchAndPrepareOverlay(opts.foregroundImageUrl!, W, H, opacity, rawW, rawH, "Foreground");
      workingBuf = await sharp(workingBuf)
        .composite([{ input: fgBuf, blend: "over" }])
        .png()
        .toBuffer();
    } catch (err) {
      throw new Error(
        `Failed to composite foreground layer: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── 8. Single final JPEG encode ─────────────────────────────────────────────
  const buffer = await encodeResultAsJpeg(workingBuf);
  return { buffer, surfaceWarning };
}

// ─── Backwards-compatible wrapper functions ───────────────────────────────────
//
// These preserve the original call signatures so existing consumers compile
// without changes. They are thin adapters over renderMockup.

/**
 * Composite a poster image into a mockup template image using bounding-box
 * placement. Returns a JPEG Buffer of the composited result.
 *
 * @deprecated Prefer renderMockup({ surface: { mode: "bbox", ... } }).
 */
export async function compositePosterIntoTemplate(
  templateImageUrl: string,
  posterImageUrl: string,
  config: CompositorConfig
): Promise<Buffer> {
  const result = await renderMockup({
    templateImageUrl,
    posterImageUrl,
    surface: {
      mode: "bbox",
      posterX: config.posterX,
      posterY: config.posterY,
      posterWidth: config.posterWidth,
      posterHeight: config.posterHeight,
      rotation: config.rotation,
      borderRadius: config.borderRadius,
      fitMode: config.fitMode,
    },
    adjustments: {
      brightness: config.brightness,
      contrast: config.contrast,
      saturation: config.saturation,
    },
  });
  return result.buffer;
}

/**
 * Composite a poster into a template using four-corner perspective placement.
 * Falls back to bounding-box if the homography cannot be computed.
 *
 * @deprecated Prefer renderMockup({ surface: { mode: "corners", ... } }).
 */
export async function compositePosterWithCorners(
  templateImageUrl: string,
  posterImageUrl: string,
  config: PerspectiveCompositorConfig
): Promise<PerspectiveCompositorResult> {
  const result = await renderMockup({
    templateImageUrl,
    posterImageUrl,
    surface: {
      mode: "corners",
      corners: config.corners,
      borderRadius: config.borderRadius,
      fitMode: config.fitMode,
    },
    adjustments: {
      brightness: config.brightness,
      contrast: config.contrast,
      saturation: config.saturation,
    },
  });
  return { buffer: result.buffer, surfaceWarning: result.surfaceWarning };
}

/**
 * Composite a poster into a template with optional layered overlays using
 * bounding-box placement.
 *
 * @deprecated Prefer renderMockup({ surface: { mode: "bbox", ... }, effectsOverlayUrl, ... }).
 */
export async function compositeLayeredMockup(
  templateImageUrl: string,
  posterImageUrl: string,
  config: LayeredCompositorConfig
): Promise<Buffer> {
  const result = await renderMockup({
    templateImageUrl,
    posterImageUrl,
    surface: {
      mode: "bbox",
      posterX: config.posterX,
      posterY: config.posterY,
      posterWidth: config.posterWidth,
      posterHeight: config.posterHeight,
      rotation: config.rotation,
      borderRadius: config.borderRadius,
      fitMode: config.fitMode,
    },
    adjustments: {
      brightness: config.brightness,
      contrast: config.contrast,
      saturation: config.saturation,
    },
    effectsOverlayUrl: config.lightingOverlayUrl,
    foregroundImageUrl: config.foregroundImageUrl,
    effectsBlendMode: config.lightingBlendMode,
    effectsOpacity: config.lightingOpacity,
    foregroundOpacity: config.foregroundOpacity,
    useBase: config.useBase,
    useLightingOverlay: config.useLightingOverlay,
    useForeground: config.useForeground,
  });
  return result.buffer;
}
