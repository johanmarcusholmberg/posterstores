/**
 * Unit tests for the mockup template validation service.
 *
 * Strategy
 * ────────
 * validateMockupTemplate downloads images via fetchImageBuffer (which calls
 * the global fetch) and inspects them with Sharp. We stub global fetch to
 * return pre-built Sharp buffers so no real network I/O occurs.
 *
 * DNS is mocked to return a public IP for all test hostnames so the SSRF
 * safety check in safeFetchBuffer passes without real DNS queries.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sharp from "sharp";
import {
  validateMockupTemplate,
  RECOMMENDED_BASE_MIN_SHORT_SIDE,
} from "../lib/mockupTemplateValidation";
import { _resolvers } from "../lib/safeImageUrl";

// ── Image helpers ─────────────────────────────────────────────────────────────

/** Solid-colour RGB PNG (no alpha). */
async function makeSolidPng(w: number, h: number, r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

/** PNG with an alpha channel where every pixel is exactly the given alpha. */
async function makeAlphaPng(w: number, h: number, alpha: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 128, g: 128, b: 128, alpha } } })
    .png()
    .toBuffer();
}

// ── Fetch URL constants ───────────────────────────────────────────────────────

const BASE_URL   = "https://val-test.example/base.png";
const SMALL_BASE = "https://val-test.example/small.png";
const EFFECTS_URL = "https://val-test.example/effects.png";
const FG_URL     = "https://val-test.example/fg.png";
const WRONG_SIZE = "https://val-test.example/wrong-size.png";
const NO_ALPHA_EFFECTS = "https://val-test.example/no-alpha-effects.png";
const OPAQUE_EFFECTS   = "https://val-test.example/opaque-effects.png";
const NO_ALPHA_FG      = "https://val-test.example/no-alpha-fg.png";
const OPAQUE_FG        = "https://val-test.example/opaque-fg.png";
const MISSING_URL      = "https://val-test.example/missing.png";

// ── Minimal valid bbox placement ──────────────────────────────────────────────

const VALID_SURFACE = {
  posterX: 10,
  posterY: 10,
  posterWidth: 80,
  posterHeight: 80,
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

const IMAGE_MAP = new Map<string, Buffer | "throw">();

beforeAll(() => {
  // All test URLs should resolve to a public IP so SSRF checks pass
  _resolvers.dnsLookup = async () => [{ address: "8.8.8.8", family: 4 }];
});

beforeAll(async () => {
  const [basePng, smallPng, effectsPng, fgPng, wrongSizePng,
         noAlphaEffects, opaqueEffects, noAlphaFg, opaqueFg] = await Promise.all([
    makeSolidPng(1200, 1500, 30, 30, 200),                   // large enough
    makeSolidPng(400, 500, 30, 30, 200),                      // below recommended min
    makeAlphaPng(1200, 1500, 0.5),                            // valid overlay
    makeAlphaPng(1200, 1500, 0.5),                            // valid foreground
    makeSolidPng(600, 800, 100, 100, 100),                    // wrong dimensions
    makeSolidPng(1200, 1500, 200, 100, 50),                   // overlay, no alpha
    makeAlphaPng(1200, 1500, 1.0),                            // overlay, fully opaque
    makeSolidPng(1200, 1500, 200, 100, 50),                   // foreground, no alpha
    makeAlphaPng(1200, 1500, 1.0),                            // foreground, fully opaque
  ]);

  IMAGE_MAP.set(BASE_URL, basePng);
  IMAGE_MAP.set(SMALL_BASE, smallPng);
  IMAGE_MAP.set(EFFECTS_URL, effectsPng);
  IMAGE_MAP.set(FG_URL, fgPng);
  IMAGE_MAP.set(WRONG_SIZE, wrongSizePng);
  IMAGE_MAP.set(NO_ALPHA_EFFECTS, noAlphaEffects);
  IMAGE_MAP.set(OPAQUE_EFFECTS, opaqueEffects);
  IMAGE_MAP.set(NO_ALPHA_FG, noAlphaFg);
  IMAGE_MAP.set(OPAQUE_FG, opaqueFg);
  IMAGE_MAP.set(MISSING_URL, "throw");

  vi.stubGlobal("fetch", async (input: string | URL | { toString(): string }): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const entry = IMAGE_MAP.get(url);
    if (entry === "throw") throw new Error("fetch: simulated network error");
    if (!entry) {
      return { ok: false, status: 404, statusText: "Not Found", headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    }
    const copy = new Uint8Array(entry);
    return { ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => copy.buffer } as unknown as Response;
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Base image validation", () => {
  it("returns BASE_MISSING error when no backgroundImageUrl", async () => {
    const result = await validateMockupTemplate({});
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "BASE_MISSING" && i.severity === "error")).toBe(true);
    expect(result.images.base).toBeNull();
  });

  it("returns BASE_FETCH_FAILED error when URL throws", async () => {
    const result = await validateMockupTemplate({ backgroundImageUrl: MISSING_URL });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "BASE_FETCH_FAILED" && i.severity === "error")).toBe(true);
  });

  it("returns BASE_RESOLUTION_LOW warning (not error) when image is below recommended short side", async () => {
    const result = await validateMockupTemplate({ backgroundImageUrl: SMALL_BASE, ...VALID_SURFACE });
    const lowResIssue = result.issues.find((i) => i.code === "BASE_RESOLUTION_LOW");
    expect(lowResIssue).toBeDefined();
    expect(lowResIssue!.severity).toBe("warning");
    // Warning-only → still valid
    expect(result.valid).toBe(true);
    expect(result.images.base).toBeDefined();
  });

  it("populates base image metadata when image is valid", async () => {
    const result = await validateMockupTemplate({ backgroundImageUrl: BASE_URL, ...VALID_SURFACE });
    expect(result.images.base).not.toBeNull();
    expect(result.images.base!.width).toBe(1200);
    expect(result.images.base!.height).toBe(1500);
    expect(result.images.base!.format).toBe("png");
    expect(result.images.base!.hasAlpha).toBe(false);
  });
});

describe("Surface validation", () => {
  it("returns SURFACE_MISSING error when no placement and no base", async () => {
    const result = await validateMockupTemplate({});
    expect(result.issues.some((i) => i.code === "SURFACE_MISSING" && i.severity === "error")).toBe(true);
  });

  it("returns SURFACE_MISSING error when base is valid but no surface defined", async () => {
    const result = await validateMockupTemplate({ backgroundImageUrl: BASE_URL });
    expect(result.issues.some((i) => i.code === "SURFACE_MISSING" && i.severity === "error")).toBe(true);
    expect(result.surface.valid).toBe(false);
    expect(result.previewable).toBe(false);
  });

  it("marks surface valid when bbox placement is defined", async () => {
    const result = await validateMockupTemplate({ backgroundImageUrl: BASE_URL, ...VALID_SURFACE });
    expect(result.surface.valid).toBe(true);
    expect(result.surface.source).not.toBe("fallback");
  });

  it("sets previewable=true and readyForSync=true for valid base + surface", async () => {
    const result = await validateMockupTemplate({ backgroundImageUrl: BASE_URL, ...VALID_SURFACE });
    expect(result.valid).toBe(true);
    expect(result.previewable).toBe(true);
    expect(result.readyForSync).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});

describe("Effects overlay validation", () => {
  const baseTemplate = { backgroundImageUrl: BASE_URL, ...VALID_SURFACE };

  it("passes with no effects overlay", async () => {
    const result = await validateMockupTemplate(baseTemplate);
    expect(result.valid).toBe(true);
    expect(result.images.effects).toBeNull();
  });

  it("returns EFFECTS_DIMENSION_MISMATCH error when overlay is the wrong size", async () => {
    const result = await validateMockupTemplate({ ...baseTemplate, lightingOverlayUrl: WRONG_SIZE });
    expect(result.issues.some((i) => i.code === "EFFECTS_DIMENSION_MISMATCH" && i.severity === "error")).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("returns EFFECTS_NO_ALPHA error when overlay has no alpha channel", async () => {
    const result = await validateMockupTemplate({ ...baseTemplate, lightingOverlayUrl: NO_ALPHA_EFFECTS });
    expect(result.issues.some((i) => i.code === "EFFECTS_NO_ALPHA" && i.severity === "error")).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("returns EFFECTS_FULLY_OPAQUE warning (not error) when overlay is opaque", async () => {
    const result = await validateMockupTemplate({ ...baseTemplate, lightingOverlayUrl: OPAQUE_EFFECTS });
    const issue = result.issues.find((i) => i.code === "EFFECTS_FULLY_OPAQUE");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
    // Warning-only → still valid
    expect(result.valid).toBe(true);
  });

  it("passes with a correctly-sized overlay with alpha", async () => {
    const result = await validateMockupTemplate({ ...baseTemplate, lightingOverlayUrl: EFFECTS_URL });
    expect(result.issues.some((i) => i.field === "lightingOverlayUrl" && i.severity === "error")).toBe(false);
    expect(result.images.effects).not.toBeNull();
    expect(result.images.effects!.hasAlpha).toBe(true);
  });
});

describe("Foreground image validation", () => {
  const baseTemplate = { backgroundImageUrl: BASE_URL, ...VALID_SURFACE };

  it("passes with no foreground", async () => {
    const result = await validateMockupTemplate(baseTemplate);
    expect(result.valid).toBe(true);
    expect(result.images.foreground).toBeNull();
  });

  it("returns FOREGROUND_DIMENSION_MISMATCH error when foreground is wrong size", async () => {
    const result = await validateMockupTemplate({ ...baseTemplate, foregroundImageUrl: WRONG_SIZE });
    expect(result.issues.some((i) => i.code === "FOREGROUND_DIMENSION_MISMATCH" && i.severity === "error")).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("returns FOREGROUND_NO_ALPHA error when foreground has no alpha channel", async () => {
    const result = await validateMockupTemplate({ ...baseTemplate, foregroundImageUrl: NO_ALPHA_FG });
    expect(result.issues.some((i) => i.code === "FOREGROUND_NO_ALPHA" && i.severity === "error")).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("returns FOREGROUND_FULLY_OPAQUE error (not warning) when foreground is opaque", async () => {
    const result = await validateMockupTemplate({ ...baseTemplate, foregroundImageUrl: OPAQUE_FG });
    const issue = result.issues.find((i) => i.code === "FOREGROUND_FULLY_OPAQUE");
    expect(issue).toBeDefined();
    // Fully opaque foreground is an ERROR (unlike effects overlay which is a warning)
    expect(issue!.severity).toBe("error");
    expect(result.valid).toBe(false);
  });

  it("passes with correctly-sized foreground with real transparency", async () => {
    const result = await validateMockupTemplate({ ...baseTemplate, foregroundImageUrl: FG_URL });
    expect(result.issues.some((i) => i.field === "foregroundImageUrl" && i.severity === "error")).toBe(false);
    expect(result.images.foreground).not.toBeNull();
    expect(result.images.foreground!.hasAlpha).toBe(true);
  });
});

describe("Combined validation — all layers", () => {
  it("returns multiple issues when both overlay and foreground have problems", async () => {
    const result = await validateMockupTemplate({
      backgroundImageUrl: BASE_URL,
      ...VALID_SURFACE,
      lightingOverlayUrl: WRONG_SIZE,
      foregroundImageUrl: WRONG_SIZE,
    });
    const effectsIssue = result.issues.find((i) => i.code === "EFFECTS_DIMENSION_MISMATCH");
    const fgIssue = result.issues.find((i) => i.code === "FOREGROUND_DIMENSION_MISMATCH");
    expect(effectsIssue).toBeDefined();
    expect(fgIssue).toBeDefined();
    expect(result.valid).toBe(false);
    expect(result.previewable).toBe(false);
  });

  it("fully valid template (base + surface + effects + fg) → previewable and readyForSync", async () => {
    const result = await validateMockupTemplate({
      backgroundImageUrl: BASE_URL,
      ...VALID_SURFACE,
      lightingOverlayUrl: EFFECTS_URL,
      foregroundImageUrl: FG_URL,
    });
    expect(result.valid).toBe(true);
    expect(result.previewable).toBe(true);
    expect(result.readyForSync).toBe(true);
    expect(result.images.base).not.toBeNull();
    expect(result.images.effects).not.toBeNull();
    expect(result.images.foreground).not.toBeNull();
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});

describe("RECOMMENDED_BASE_MIN_SHORT_SIDE constant", () => {
  it("is exported and equals 1200", () => {
    expect(RECOMMENDED_BASE_MIN_SHORT_SIDE).toBe(1200);
  });
});
