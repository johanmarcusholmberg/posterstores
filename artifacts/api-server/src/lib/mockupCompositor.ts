import sharp from "sharp";
import { ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();

// ─── Bounding-box compositor (original, backwards-compatible) ─────────────────

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

// ─── Corner-based surface types (for perspective rendering) ───────────────────

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

// ─── Shared utilities ─────────────────────────────────────────────────────────

function getInternalObjectPath(source: string): string | null {
  const trimmed = source.trim();

  // Direct object-storage path:
  // /objects/uploads/abc123
  if (trimmed.startsWith("/objects/")) {
    return trimmed;
  }

  // Browser-serving route:
  // /api/storage/objects/uploads/abc123
  //
  // ObjectStorageService expects:
  // /objects/uploads/abc123
  const storageApiPrefix = "/api/storage";

  if (trimmed.startsWith(`${storageApiPrefix}/objects/`)) {
    return trimmed.slice(storageApiPrefix.length);
  }

  return null;
}

async function fetchImageBuffer(source: string): Promise<Buffer> {
  const trimmed = source.trim();
  const internalObjectPath = getInternalObjectPath(trimmed);

  // Uploaded files should be read directly from object storage.
  if (internalObjectPath) {
    const file = await storage.getObjectEntityFile(internalObjectPath);
    const [buffer] = await file.download();

    return buffer;
  }

  // Externally hosted images still use normal HTTP fetching.
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error(`Unsupported image source: ${trimmed}`);
  }

  if (
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "https:"
  ) {
    throw new Error(
      `Unsupported image protocol: ${parsedUrl.protocol}`
    );
  }

  const response = await fetch(parsedUrl.toString(), {
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch image (${response.status}): ${parsedUrl.toString()}`
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

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

// ─── Perspective warp math ────────────────────────────────────────────────────

/**
 * Solve an 8×8 linear system A·h = b using Gaussian elimination with
 * partial pivoting. Returns the solution vector or null if the system
 * is singular or nearly singular.
 */
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

/**
 * Compute a 3×3 projective homography H such that dst[i] ≈ H · src[i]
 * (in homogeneous coordinates). Returns a 9-element row-major array [h00..h22]
 * with h22 = 1, or null if the system cannot be solved.
 */
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

/** Invert a 3×3 matrix (row-major, 9 elements). Returns null if singular. */
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

/** Apply a 3×3 homography to point (px, py). Returns [-1,-1] on degenerate w. */
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
 * Returns a transparent PNG (templateW × templateH) with only the warped poster
 * pixels filled in, ready to be composited over the template background.
 * Returns null if the homography cannot be computed.
 *
 * Performance note: O(bbW × bbH) iterations where bbW/bbH is the bounding box
 * of the destination quad. For a 2000 × 2000 template this is at most 4M pixels
 * (~100–300 ms in Node.js, well within sync timeout budgets).
 */
async function perspectiveWarpPoster(
  posterBuf: Buffer,
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

  const { data: posterRgba, info } = await sharp(posterBuf)
    .resize(bbW, bbH, { fit: sharpFit, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sampW = info.width;
  const sampH = info.height;

  // H maps poster-pixel space (0..sampW, 0..sampH) → template-pixel space
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

// ─── Layered compositor helpers ────────────────────────────────────────────────

const VALID_BLEND_MODES = ["multiply", "screen", "overlay", "soft-light", "over"] as const;
type LayerBlendMode = typeof VALID_BLEND_MODES[number];

function normalizeBlendMode(mode: string | null | undefined): LayerBlendMode {
  if (mode && (VALID_BLEND_MODES as readonly string[]).includes(mode)) {
    return mode as LayerBlendMode;
  }
  return "multiply";
}

/** Fetch, resize to target dimensions, and apply opacity to an overlay image. */
async function fetchAndPrepareOverlay(
  url: string,
  targetW: number,
  targetH: number,
  opacity: number
): Promise<Buffer> {
  const raw = await fetchImageBuffer(url);

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

// ─── Exported compositors ─────────────────────────────────────────────────────

/**
 * Internal helper: place a pre-loaded, pre-resized poster onto a pre-loaded
 * base canvas buffer using the given bounding-box placement config.
 *
 * W / H are the pixel dimensions of baseBuf (the caller must supply them to
 * avoid a redundant metadata() call when the caller already knows the size).
 */
async function applyPosterToCanvas(
  baseBuf: Buffer,
  posterBuffer: Buffer,
  W: number,
  H: number,
  config: CompositorConfig
): Promise<Buffer> {
  const fit = config.fitMode ?? "cover";
  const areaLeft = Math.round((config.posterX / 100) * W);
  const areaTop = Math.round((config.posterY / 100) * H);
  const areaW = Math.round((config.posterWidth / 100) * W);
  const areaH = Math.round((config.posterHeight / 100) * H);

  if (areaW <= 0 || areaH <= 0) throw new Error(`Invalid placement area: ${areaW}x${areaH}`);

  const sharpFit: "cover" | "contain" | "fill" =
    fit === "stretch" ? "fill" : fit === "contain" ? "contain" : "cover";

  let posterResized = sharp(posterBuffer).resize(areaW, areaH, {
    fit: sharpFit,
    withoutEnlargement: false,
  });

  if (config.rotation) {
    posterResized = posterResized
      .rotate(config.rotation, { background: { r: 0, g: 0, b: 0, a: 0 } })
      .resize(areaW, areaH, { fit: "cover" });
  }

  const borderRadiusPx =
    config.borderRadius != null && config.borderRadius > 0
      ? Math.round((config.borderRadius / 100) * Math.min(areaW, areaH))
      : 0;

  let posterBuf = await posterResized.toBuffer();

  if (borderRadiusPx > 0) {
    const { width: pw = areaW, height: ph = areaH } = await sharp(posterBuf).metadata();
    const maskSvg = buildRoundedMask(pw, ph, borderRadiusPx);
    posterBuf = await sharp(posterBuf)
      .composite([{ input: maskSvg, blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  const modulations: { brightness?: number; saturation?: number } = {};
  if (config.brightness != null && config.brightness !== 1) modulations.brightness = config.brightness;
  if (config.saturation != null && config.saturation !== 1) modulations.saturation = config.saturation;

  let compositeSharp = sharp(baseBuf).composite([
    { input: posterBuf, left: areaLeft, top: areaTop, blend: "over" },
  ]);

  if (Object.keys(modulations).length > 0) compositeSharp = compositeSharp.modulate(modulations);

  if (config.contrast != null && config.contrast !== 1) {
    const linear = config.contrast;
    const offset = Math.round(128 * (1 - linear));
    compositeSharp = compositeSharp.linear(linear, offset);
  }

  return compositeSharp.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/**
 * Composite a poster image into a mockup template image using the given
 * bounding-box placement config. Returns a JPEG Buffer of the composited result.
 *
 * Placement values (posterX, posterY, posterWidth, posterHeight) are
 * percentages of the template image's dimensions (0–100).
 */
export async function compositePosterIntoTemplate(
  templateImageUrl: string,
  posterImageUrl: string,
  config: CompositorConfig
): Promise<Buffer> {
  const [templateBuffer, posterBuffer] = await Promise.all([
    fetchImageBuffer(templateImageUrl),
    fetchImageBuffer(posterImageUrl),
  ]);

  const { width: W = 1000, height: H = 1000 } = await sharp(templateBuffer).metadata();
  return applyPosterToCanvas(templateBuffer, posterBuffer, W, H, config);
}

/**
 * Composite a poster into a template using a four-corner perspective surface.
 *
 * When corners define a non-rectangular quad, performs a full homographic
 * perspective warp so the poster conforms to angled/tilted surfaces (e.g. a
 * poster on a table or leaning against a wall).
 *
 * Falls back to bounding-box rendering and sets `surfaceWarning` in the result
 * if the homography cannot be computed.
 *
 * Template is capped at 2000 px on the longest edge to bound memory use.
 */
export async function compositePosterWithCorners(
  templateImageUrl: string,
  posterImageUrl: string,
  config: PerspectiveCompositorConfig
): Promise<PerspectiveCompositorResult> {
  const [templateBuffer, posterBuffer] = await Promise.all([
    fetchImageBuffer(templateImageUrl),
    fetchImageBuffer(posterImageUrl),
  ]);

  const rawMeta = await sharp(templateBuffer).metadata();
  const rawW = rawMeta.width ?? 1000;
  const rawH = rawMeta.height ?? 1000;

  const MAX_DIM = 2000;
  const scale = Math.min(1, MAX_DIM / Math.max(rawW, rawH));
  const processW = Math.round(rawW * scale);
  const processH = Math.round(rawH * scale);

  const templateBuf =
    scale < 1
      ? await sharp(templateBuffer).resize(processW, processH).toBuffer()
      : templateBuffer;

  const fitStr = config.fitMode ?? "cover";
  const fitMode = (["cover", "contain", "stretch"].includes(fitStr) ? fitStr : "cover") as
    | "cover"
    | "contain"
    | "stretch";

  let surfaceWarning: string | undefined;
  let warpedPng: Buffer | null = null;

  try {
    warpedPng = await perspectiveWarpPoster(
      posterBuffer,
      config.corners,
      processW,
      processH,
      fitMode
    );
  } catch (err) {
    surfaceWarning = `Perspective warp error (${err instanceof Error ? err.message : "unknown"}) — falling back to bounding-box render`;
  }

  if (!warpedPng) {
    if (!surfaceWarning) {
      surfaceWarning =
        "Perspective surface configured, but renderer fell back to rectangle. (Homography degenerate or corners too close.)";
    }
    const bb = cornersToBoundingBox(config.corners);
    const fallback = await compositePosterIntoTemplate(templateImageUrl, posterImageUrl, {
      posterX: bb.x * 100,
      posterY: bb.y * 100,
      posterWidth: bb.width * 100,
      posterHeight: bb.height * 100,
      fitMode: config.fitMode,
      borderRadius: config.borderRadius,
      brightness: config.brightness,
      contrast: config.contrast,
      saturation: config.saturation,
    });
    return { buffer: fallback, surfaceWarning };
  }

  let compositeSharp = sharp(templateBuf).composite([{ input: warpedPng, blend: "over" }]);

  const modulations: { brightness?: number; saturation?: number } = {};
  if (config.brightness != null && config.brightness !== 1) modulations.brightness = config.brightness;
  if (config.saturation != null && config.saturation !== 1) modulations.saturation = config.saturation;
  if (Object.keys(modulations).length > 0) compositeSharp = compositeSharp.modulate(modulations);

  if (config.contrast != null && config.contrast !== 1) {
    const linear = config.contrast;
    const offset = Math.round(128 * (1 - linear));
    compositeSharp = compositeSharp.linear(linear, offset);
  }

  const buffer = await compositeSharp.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return { buffer, surfaceWarning };
}

// ─── Layered compositor ────────────────────────────────────────────────────────

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

/**
 * Composite a poster into a template with optional layered overlays.
 *
 * Render order:
 *  1. Base image (or plain white canvas when useBase=false) with poster artwork
 *     composited into the placement area via applyPosterToCanvas.
 *  2. Lighting / shadow / reflection overlay (optional, blend mode + opacity).
 *  3. Foreground image (optional, "over" blend).
 *
 * Layers with missing assets or use*=false are silently skipped.
 * Non-layered templates should use compositePosterIntoTemplate directly.
 *
 * Template image is fetched once for both dimension lookup and rendering —
 * no double-fetch regardless of useBase setting.
 */
export async function compositeLayeredMockup(
  templateImageUrl: string,
  posterImageUrl: string,
  config: LayeredCompositorConfig
): Promise<Buffer> {
  // Fetch both images upfront — dimensions are always needed for overlay sizing
  // and the poster must always be placed regardless of useBase.
  const [templateBuf, posterBuffer] = await Promise.all([
    fetchImageBuffer(templateImageUrl),
    fetchImageBuffer(posterImageUrl),
  ]);

  const { width: W = 1000, height: H = 1000 } = await sharp(templateBuf).metadata();

  // ── Step 1+2: base canvas + poster placement ─────────────────────────────
  let currentBuffer: Buffer;

  if (config.useBase === false) {
    // No background: composite poster onto a plain white canvas.
    // Template is still fetched above (needed for W/H); its pixels are not used.
    const whiteBuf = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    currentBuffer = await applyPosterToCanvas(whiteBuf, posterBuffer, W, H, config);
  } else {
    // Standard path: composite poster onto the background image.
    currentBuffer = await applyPosterToCanvas(templateBuf, posterBuffer, W, H, config);
  }

  // ── Step 3: lighting / shadow overlay ────────────────────────────────────
  const hasLighting = config.useLightingOverlay !== false && !!config.lightingOverlayUrl;
  const hasForeground = config.useForeground !== false && !!config.foregroundImageUrl;

  if (!hasLighting && !hasForeground) return currentBuffer;

  if (hasLighting) {
    try {
      const blendMode = normalizeBlendMode(config.lightingBlendMode);
      const opacity = Math.max(0, Math.min(1, config.lightingOpacity ?? 0.8));
      const overlayBuf = await fetchAndPrepareOverlay(config.lightingOverlayUrl!, W, H, opacity);
      currentBuffer = await sharp(currentBuffer)
        .composite([{ input: overlayBuf, blend: blendMode }])
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    } catch {
      // skip layer on error
    }
  }

  // ── Step 4: foreground overlay ────────────────────────────────────────────
  if (hasForeground) {
    try {
      const opacity = Math.max(0, Math.min(1, config.foregroundOpacity ?? 1.0));
      const fgBuf = await fetchAndPrepareOverlay(config.foregroundImageUrl!, W, H, opacity);
      currentBuffer = await sharp(currentBuffer)
        .composite([{ input: fgBuf, blend: "over" }])
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    } catch {
      // skip layer on error
    }
  }

  return currentBuffer;
}
