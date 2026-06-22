import sharp from "sharp";

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

/**
 * Fetch a remote image and return its raw buffer.
 * Throws on HTTP errors or network failures.
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Build a rounded-rectangle SVG mask for the given dimensions.
 */
function buildRoundedMask(w: number, h: number, r: number): Buffer {
  const rx = Math.min(r, w / 2, h / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="white"/>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Composite a poster image into a mockup template image using the given
 * placement config. Returns a JPEG Buffer of the composited result.
 *
 * Placement values (posterX, posterY, posterWidth, posterHeight) are
 * percentages of the template image's dimensions (0-100).
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

  const templateMeta = await sharp(templateBuffer).metadata();
  const templateW = templateMeta.width ?? 1000;
  const templateH = templateMeta.height ?? 1000;

  const fit = config.fitMode ?? "cover";
  const pxPct = config.posterX / 100;
  const pyPct = config.posterY / 100;
  const pwPct = config.posterWidth / 100;
  const phPct = config.posterHeight / 100;

  const areaLeft = Math.round(pxPct * templateW);
  const areaTop = Math.round(pyPct * templateH);
  const areaW = Math.round(pwPct * templateW);
  const areaH = Math.round(phPct * templateH);

  if (areaW <= 0 || areaH <= 0) {
    throw new Error(`Invalid placement area: ${areaW}x${areaH}`);
  }

  const sharpFit: "cover" | "contain" | "fill" =
    fit === "stretch" ? "fill" : fit === "contain" ? "contain" : "cover";

  let posterResized = sharp(posterBuffer).resize(areaW, areaH, {
    fit: sharpFit,
    withoutEnlargement: false,
  });

  if (config.rotation) {
    posterResized = posterResized.rotate(config.rotation, {
      background: { r: 0, g: 0, b: 0, a: 0 },
    });
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
  if (config.brightness != null && config.brightness !== 1) {
    modulations.brightness = config.brightness;
  }
  if (config.saturation != null && config.saturation !== 1) {
    modulations.saturation = config.saturation;
  }

  let compositeSharp = sharp(templateBuffer).composite([
    {
      input: posterBuf,
      left: areaLeft,
      top: areaTop,
      blend: "over",
    },
  ]);

  if (Object.keys(modulations).length > 0) {
    compositeSharp = compositeSharp.modulate(modulations);
  }

  if (config.contrast != null && config.contrast !== 1) {
    const linear = config.contrast;
    const offset = Math.round(128 * (1 - linear));
    compositeSharp = compositeSharp.linear(linear, offset);
  }

  return compositeSharp.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
