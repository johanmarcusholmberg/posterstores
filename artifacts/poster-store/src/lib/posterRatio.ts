import { Poster } from "@workspace/api-client-react";

// Known ISO/standard size labels → [widthMm, heightMm]
const SIZE_LABEL_MAP: Record<string, [number, number]> = {
  a5: [148, 210],
  a4: [210, 297],
  a3: [297, 420],
  a2: [420, 594],
  a1: [594, 841],
  a0: [841, 1189],
  "21x30": [21, 30],
  "30x21": [30, 21],
  "30x40": [30, 40],
  "40x30": [40, 30],
  "40x50": [40, 50],
  "50x40": [50, 40],
  "50x70": [50, 70],
  "70x50": [70, 50],
  "60x80": [60, 80],
  "80x60": [80, 60],
  "70x100": [70, 100],
  "100x70": [100, 70],
  "30x30": [30, 30],
  "40x40": [40, 40],
  "50x50": [50, 50],
  "60x60": [60, 60],
  "90x120": [90, 120],
  "120x90": [120, 90],
};

function parseSizeLabel(label: string): [number, number] | null {
  const lower = label.toLowerCase().trim();
  if (SIZE_LABEL_MAP[lower]) return SIZE_LABEL_MAP[lower];
  // Generic "WxH" or "W×H" pattern (integer or decimal)
  const match = lower.match(/^(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)(?:cm|mm|in)?$/);
  if (match) {
    const w = parseFloat(match[1]);
    const h = parseFloat(match[2]);
    if (w > 0 && h > 0) return [w, h];
  }
  return null;
}

export type PosterOrientation = "portrait" | "landscape" | "square";

export interface PosterRatioResult {
  /** width / height */
  ratio: number;
  orientation: PosterOrientation;
}

/**
 * Derive the aspect ratio of a poster from its size labels.
 * Prefers the first active size; falls back to the first size in the array.
 * Returns null when no size label is present or recognised.
 */
export function parsePosterRatio(poster: Poster): PosterRatioResult | null {
  const sizes = poster.posterSizes ?? [];
  const target = sizes.find((s) => s.active) ?? sizes[0];
  if (!target) return null;

  const parsed = parseSizeLabel(target.sizeLabel);
  if (!parsed) return null;

  const [w, h] = parsed;
  const ratio = w / h;

  const orientation: PosterOrientation =
    ratio < 0.85 ? "portrait" : ratio > 1.15 ? "landscape" : "square";

  return { ratio, orientation };
}

// ─── Card-fitting helpers ─────────────────────────────────────────────────────

/**
 * The fixed card container uses aspect-[3/4] = 0.75 ratio.
 * When a portrait poster's ratio is within this threshold of 0.75,
 * object-cover fills the card cleanly without visible cropping.
 */
const CARD_RATIO = 0.75;
const COVER_THRESHOLD = 0.18;

/**
 * Returns true when the poster should fill the full card area (object-cover).
 * Applies only to portrait posters whose ratio is close to the 3:4 card ratio.
 */
export function posterFillsCard(ratio: number | null): boolean {
  if (ratio === null) return false;
  return ratio < 0.85 && Math.abs(ratio - CARD_RATIO) < COVER_THRESHOLD;
}
