/**
 * AI Mockup Renderer
 *
 * Uses the gpt-image-1 image editing endpoint to composite a poster artwork
 * into a mockup background scene, producing realistic lifestyle images.
 *
 * Render quality is non-deterministic — admin review is always required before
 * AI-rendered mockups are published publicly.
 *
 * The editImages helper requires local PNG files on disk. We download both
 * the poster and template images, convert them to PNG via Sharp, write to a
 * temp directory, call the API, and clean up afterwards.
 */

import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { editImages } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import type { DetectedPlacementConfig } from "./mockupPlacementAnalyzer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiRenderOptions {
  /** Full or relative URL of the poster artwork image. */
  posterImageUrl: string;
  /** Full or relative URL of the mockup background image. */
  templateImageUrl: string;
  /** Optional placement config (from smart placement detection). */
  detectedPlacement?: DetectedPlacementConfig | null;
  /** Optional admin-supplied style/scene guidance prompt. */
  renderPrompt?: string | null;
  /** Template category for prompt context (e.g. "Wall", "Interior"). */
  templateCategory?: string | null;
  /** Template name for logging and prompt context. */
  templateName?: string;
}

export interface AiRenderResult {
  status: "success" | "failed";
  /** JPEG buffer of the composited result. Only set when status = "success". */
  imageBuffer?: Buffer;
  /**
   * Human-readable warning shown to admin in sync results.
   * Always set on success so admin knows to review.
   */
  warning?: string;
  /** Error message. Only set when status = "failed". */
  error?: string;
}

// ─── URL resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a potentially relative image URL to an absolute one.
 * Relative URLs like /api/storage/objects/… are proxied through localhost:80.
 */
function resolveImageUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `http://localhost:80${url}`;
  return url;
}

// ─── Image download ───────────────────────────────────────────────────────────

/**
 * Download an image by URL, convert it to PNG via Sharp, and write it to a
 * temp file. Returns the temp file path. Caller must delete the file.
 */
async function downloadToPngTempFile(url: string): Promise<string> {
  const absUrl = resolveImageUrl(url);
  const res = await fetch(absUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status}): ${absUrl}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  // Convert to PNG to satisfy gpt-image-1 edit API requirement
  const pngBuffer = await sharp(inputBuffer).png().toBuffer();

  const filePath = join(tmpdir(), `ai-render-${randomUUID().slice(0, 8)}.png`);
  writeFileSync(filePath, pngBuffer);
  return filePath;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildRenderPrompt(opts: AiRenderOptions): string {
  const { detectedPlacement, renderPrompt, templateCategory, templateName } = opts;

  let areaHint = "";
  if (detectedPlacement?.boundingBox) {
    const bb = detectedPlacement.boundingBox;
    const cx = Math.round((bb.x + bb.width / 2) * 100);
    const cy = Math.round((bb.y + bb.height / 2) * 100);
    const wPct = Math.round(bb.width * 100);
    const hPct = Math.round(bb.height * 100);
    areaHint = ` The poster/frame area occupies approximately ${wPct}% × ${hPct}% of the scene, centred at ${cx}% from the left and ${cy}% from the top.`;
  }

  const categoryHint = templateCategory
    ? ` Scene type: ${templateCategory.toLowerCase()} mockup.`
    : "";
  const templateHint = templateName ? ` Template: "${templateName}".` : "";
  const customPrompt = renderPrompt
    ? `\n\nAdmin style guidance: ${renderPrompt}`
    : "";

  return [
    "You are compositing a poster artwork into a mockup background scene.",
    "",
    "The FIRST image is the poster artwork that must be placed into the scene.",
    "The SECOND image is the mockup background scene (a room, wall, interior, etc).",
    "",
    "CRITICAL REQUIREMENTS:",
    "1. Insert the poster artwork EXACTLY as provided — do NOT redesign, repaint, reinterpret, crop, resize, or alter the poster artwork in any way.",
    "2. Preserve ALL text, colors, borders, and every visual detail of the poster.",
    "3. Place the artwork naturally into the visible poster frame, canvas, or wall area of the background scene.",
    `4. Match the lighting, perspective, shadow, and surface texture of the scene.${areaHint}`,
    "5. Keep the room/background scene UNCHANGED — do not add, move, or remove any room elements.",
    "6. Add only realistic and subtle: paper texture, gentle frame drop-shadow, or glass reflection where they appear natural.",
    "7. The result must look like a professional product photo where the actual poster is shown displayed in the room.",
    `${categoryHint}${templateHint}${customPrompt}`,
    "",
    "Return only the final composited mockup image.",
  ]
    .join("\n")
    .trim();
}

// ─── Quality / size ───────────────────────────────────────────────────────────

/**
 * TODO: AI render quality control
 *
 * The `editImages` helper from @workspace/integrations-openai-ai-server does NOT
 * currently expose a quality or size parameter — the underlying `openai.images.edit`
 * call uses the provider default for gpt-image-1 with no `quality` or `size` field.
 *
 * The gpt-image-1 image-edit endpoint does support a `quality` parameter
 * ("low" | "medium" | "high", default "auto") and a `size` parameter.
 * To enable admin-configurable quality:
 *   1. Update `editImages()` in lib/integrations-openai-ai-server/src/image/client.ts
 *      to accept an optional options argument: `{ quality?: "low" | "medium" | "high"; size?: string }`
 *   2. Pass `options.quality` to the `openai.images.edit` call.
 *   3. Expose a `quality` field on AiRenderOptions and thread it from the template or sync call.
 *   4. Store `aiRenderQuality: "low" | "medium" | "high"` on mockup_templates (default "low").
 *
 * Until the helper exposes quality, all AI renders use the provider's default quality.
 * "low" is recommended for review renders; admins should regenerate with "medium" or
 * "high" after confirming composition is acceptable.
 */

// ─── Main renderer ────────────────────────────────────────────────────────────

/**
 * Render an AI-composited mockup image.
 *
 * Downloads poster + template to temp PNG files, calls gpt-image-1 edit,
 * and returns the result as a JPEG buffer. Temp files are always cleaned up.
 *
 * Always returns {status, warning} on success — admin must review before
 * publishing because gpt-image-1 may subtly alter artwork fidelity.
 */
export async function renderAiMockup(opts: AiRenderOptions): Promise<AiRenderResult> {
  const tmpFiles: string[] = [];

  try {
    logger.info(
      { event: "ai_render_start", template: opts.templateName, category: opts.templateCategory },
      "Starting AI mockup render"
    );

    // Download both images to temp PNG files in parallel
    const [posterFile, templateFile] = await Promise.all([
      downloadToPngTempFile(opts.posterImageUrl),
      downloadToPngTempFile(opts.templateImageUrl),
    ]);
    tmpFiles.push(posterFile, templateFile);

    const prompt = buildRenderPrompt(opts);
    logger.info({ event: "ai_render_call", promptLength: prompt.length }, "Calling gpt-image-1 edit");

    // gpt-image-1 edit: poster first, then template background
    const rawBuffer = await editImages([posterFile, templateFile], prompt);

    // Convert output to JPEG for storage efficiency
    const jpegBuffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer();

    logger.info(
      { event: "ai_render_success", outputBytes: jpegBuffer.length },
      "AI mockup render succeeded"
    );

    return {
      status: "success",
      imageBuffer: jpegBuffer,
      warning:
        "AI-rendered — review poster fidelity before publishing. Colors, text, or proportions may have been subtly altered.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI render failed";
    logger.error({ err, event: "ai_render_error" }, "AI mockup render failed");
    return { status: "failed", error: msg };
  } finally {
    for (const f of tmpFiles) {
      try {
        unlinkSync(f);
      } catch {
        // Non-fatal — temp file cleanup failure
      }
    }
  }
}
