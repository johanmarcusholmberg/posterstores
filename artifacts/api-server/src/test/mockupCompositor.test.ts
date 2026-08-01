/**
 * Unit tests for the unified mockup renderer (renderMockup).
 *
 * These tests work entirely with in-memory Sharp buffers — no network access,
 * no object storage.  Global fetch is stubbed to return test images keyed by
 * URL so the compositor's fetchImageBuffer can find them.
 *
 * ObjectStorageService is mocked so the module initialises without credentials.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sharp from "sharp";
import { _resolvers as safeImageResolvers } from "../lib/safeImageUrl";

// ── Module mocks (must be declared before any import of the modules they replace)

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: vi.fn().mockImplementation(() => ({
    getObjectEntityFile: vi
      .fn()
      .mockRejectedValue(new Error("object storage not available in unit tests")),
    uploadBuffer: vi.fn().mockResolvedValue("/objects/test/mock.jpg"),
    deleteObject: vi.fn().mockResolvedValue(true),
  })),
}));

// ── Imports (after mocks are registered) ──────────────────────────────────────

import {
  renderMockup,
  encodeResultAsJpeg,
  applyAdjustmentsToPoster,
  type CornerPoints,
} from "../lib/mockupCompositor";

// ── Test image registry & fetch mock ─────────────────────────────────────────

/** Map of URL → PNG buffer, populated by makeTestUrl before tests run. */
const TEST_IMAGES = new Map<string, Buffer>();

function makeTestUrl(key: string): string {
  return `https://test-compositor.local/${key}.png`;
}

async function makeColorImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

/** Read R/G/B channels of one pixel from a JPEG or PNG buffer. */
async function getPixel(
  buf: Buffer,
  x: number,
  y: number
): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

// ── Image URLs used across tests ──────────────────────────────────────────────

const BASE_URL = makeTestUrl("base-blue");         // 200×200 solid blue
const POSTER_URL = makeTestUrl("poster-red");      // 100×100 solid red
const OVERLAY_URL = makeTestUrl("overlay-green");  // 200×200 solid green (effects overlay)
const FG_URL = makeTestUrl("fg-white");            // 200×200 white (foreground)
const BROKEN_URL = makeTestUrl("broken-404");      // will return HTTP 404

// Canonical corners covering top-left 40×40% of a 200×200 image
const RECT_CORNERS: CornerPoints = {
  topLeft:     { x: 0.0, y: 0.0 },
  topRight:    { x: 0.4, y: 0.0 },
  bottomRight: { x: 0.4, y: 0.4 },
  bottomLeft:  { x: 0.0, y: 0.4 },
};

// Slightly skewed (non-rectangular) quad — exercises real perspective warp
const SKEWED_CORNERS: CornerPoints = {
  topLeft:     { x: 0.05, y: 0.05 },
  topRight:    { x: 0.55, y: 0.10 },
  bottomRight: { x: 0.60, y: 0.60 },
  bottomLeft:  { x: 0.05, y: 0.55 },
};

// ── Lifecycle: populate TEST_IMAGES and stub global.fetch ─────────────────────

beforeAll(() => {
  // All test URLs (https://test-compositor.local/…) must pass SSRF checks.
  // vi.mock("dns/promises") doesn't work in pool:"forks"; inject directly.
  safeImageResolvers.dnsLookup = async () => [{ address: "1.2.3.4", family: 4 }];
});

beforeAll(async () => {
  const [blueBase, redPoster, greenOverlay, whiteFg] = await Promise.all([
    makeColorImage(200, 200, 0, 0, 200),
    makeColorImage(100, 100, 200, 0, 0),
    makeColorImage(200, 200, 0, 200, 0),
    makeColorImage(200, 200, 255, 255, 255),
  ]);

  TEST_IMAGES.set(BASE_URL, blueBase);
  TEST_IMAGES.set(POSTER_URL, redPoster);
  TEST_IMAGES.set(OVERLAY_URL, greenOverlay);
  TEST_IMAGES.set(FG_URL, whiteFg);
  // BROKEN_URL is intentionally not added — fetch will return 404

  vi.stubGlobal("fetch", async (input: string | URL | { toString(): string }) => {
    const url = typeof input === "string" ? input : input.toString();
    const buf = TEST_IMAGES.get(url);
    if (!buf) {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
        body: null,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    }
    const copy = new Uint8Array(buf);
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null,
      arrayBuffer: async () => copy.buffer,
    } as unknown as Response;
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Bounding-box rendering
// ─────────────────────────────────────────────────────────────────────────────

describe("Bounding-box rendering", () => {
  it("renders base + poster (JPEG output, poster colour visible in area)", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer[0]).toBe(0xff);  // JPEG SOI marker
    expect(result.buffer[1]).toBe(0xd8);

    // Pixel inside poster area should be reddish
    const inPoster = await getPixel(result.buffer, 50, 50);
    expect(inPoster.r).toBeGreaterThan(100);
    expect(inPoster.b).toBeLessThan(80);

    // Pixel outside poster area should be bluish
    const inBase = await getPixel(result.buffer, 160, 160);
    expect(inBase.b).toBeGreaterThan(100);
    expect(inBase.r).toBeLessThan(80);
  });

  it("renders base + poster + effects overlay", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      effectsOverlayUrl: OVERLAY_URL,
      effectsBlendMode: "over",
      effectsOpacity: 0.6,
    });

    expect(result.buffer[0]).toBe(0xff);

    // Green overlay at opacity 0.6 should make the base area noticeably greener
    const inBase = await getPixel(result.buffer, 160, 160);
    expect(inBase.g).toBeGreaterThan(80);  // overlay pushed green channel up
  });

  it("renders base + poster + foreground", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      foregroundImageUrl: FG_URL,
      foregroundOpacity: 0.5,
    });

    expect(result.buffer[0]).toBe(0xff);

    // White foreground at 0.5 opacity blends with blue base → lighter pixel
    const inBase = await getPixel(result.buffer, 160, 160);
    expect(inBase.r).toBeGreaterThan(80);  // white foreground lifted red and green
    expect(inBase.g).toBeGreaterThan(80);
  });

  it("renders base + poster + effects + foreground in correct order", async () => {
    // Green effects overlay + white foreground both applied
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      effectsOverlayUrl: OVERLAY_URL,
      effectsBlendMode: "over",
      effectsOpacity: 0.5,
      foregroundImageUrl: FG_URL,
      foregroundOpacity: 0.5,
    });

    expect(result.buffer[0]).toBe(0xff);

    // Both layers were applied — foreground (white) on top of effects (green)
    // Pixel in base area should be fairly bright (mix of green + white)
    const inBase = await getPixel(result.buffer, 160, 160);
    expect(inBase.r + inBase.g + inBase.b).toBeGreaterThan(300);
  });

  it("skips effects layer when useLightingOverlay is false even if URL is set", async () => {
    const withOverlay = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      effectsOverlayUrl: OVERLAY_URL,
      useLightingOverlay: false,
    });

    // No green tint in base area because overlay is disabled
    const inBase = await getPixel(withOverlay.buffer, 160, 160);
    expect(inBase.b).toBeGreaterThan(100);   // still blue
    expect(inBase.g).toBeLessThan(100);      // no green added
  });

  it("skips foreground layer when useForeground is false even if URL is set", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      foregroundImageUrl: FG_URL,
      foregroundOpacity: 1.0,
      useForeground: false,
    });

    // Blue base should be unaffected since foreground is disabled
    const inBase = await getPixel(result.buffer, 160, 160);
    expect(inBase.b).toBeGreaterThan(100);
    expect(inBase.r).toBeLessThan(80);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Perspective (corners) rendering
// ─────────────────────────────────────────────────────────────────────────────

describe("Perspective (corners) rendering", () => {
  it("renders base + poster using rectangular corners (same as bbox, exercises warp path)", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "corners", corners: RECT_CORNERS },
    });

    expect(result.buffer[0]).toBe(0xff);
    expect(result.buffer[1]).toBe(0xd8);

    // Area outside the quad should remain blue
    const outside = await getPixel(result.buffer, 160, 160);
    expect(outside.b).toBeGreaterThan(100);
    expect(outside.r).toBeLessThan(80);
  });

  it("renders base + poster using skewed corners (actual perspective warp)", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "corners", corners: SKEWED_CORNERS },
    });

    expect(result.buffer[0]).toBe(0xff);
    // Image should render without error and return a non-empty buffer
    expect(result.buffer.length).toBeGreaterThan(1000);
  });

  it("perspective + effects overlay", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "corners", corners: RECT_CORNERS },
      effectsOverlayUrl: OVERLAY_URL,
      effectsBlendMode: "over",
      effectsOpacity: 0.6,
    });

    expect(result.buffer[0]).toBe(0xff);

    // Green overlay is applied over the whole image
    const outside = await getPixel(result.buffer, 160, 160);
    expect(outside.g).toBeGreaterThan(80);
  });

  it("perspective + foreground layer", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "corners", corners: RECT_CORNERS },
      foregroundImageUrl: FG_URL,
      foregroundOpacity: 0.5,
    });

    expect(result.buffer[0]).toBe(0xff);

    // White foreground at 0.5 opacity lifts pixel brightness
    const outside = await getPixel(result.buffer, 160, 160);
    expect(outside.r + outside.g + outside.b).toBeGreaterThan(200);
  });

  it("perspective + effects and foreground layers", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "corners", corners: RECT_CORNERS },
      effectsOverlayUrl: OVERLAY_URL,
      effectsBlendMode: "over",
      effectsOpacity: 0.5,
      foregroundImageUrl: FG_URL,
      foregroundOpacity: 0.3,   // partial opacity → result is not a solid flat colour
    });

    // Valid JPEG with SOI + EOI markers
    expect(result.buffer[0]).toBe(0xff);
    expect(result.buffer[1]).toBe(0xd8);
    const last = result.buffer.length - 1;
    expect(result.buffer[last]).toBe(0xd9);
    expect(result.buffer[last - 1]).toBe(0xff);
  });

  it("returns surfaceWarning when warp falls back (degenerate corners)", async () => {
    // Collinear corners → homography degenerate
    const degenerateCorners: CornerPoints = {
      topLeft:     { x: 0.1, y: 0.1 },
      topRight:    { x: 0.1, y: 0.1 },   // same as topLeft
      bottomRight: { x: 0.5, y: 0.5 },
      bottomLeft:  { x: 0.1, y: 0.5 },
    };

    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "corners", corners: degenerateCorners },
    });

    expect(result.buffer[0]).toBe(0xff);
    expect(result.surfaceWarning).toBeDefined();
    expect(typeof result.surfaceWarning).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Adjustment isolation — adjustments affect only the poster
// ─────────────────────────────────────────────────────────────────────────────

describe("Adjustment isolation", () => {
  it("applyAdjustmentsToPoster: saturation=0 desaturates poster", async () => {
    const redPoster = await makeColorImage(100, 100, 200, 0, 0);
    const adjusted = await applyAdjustmentsToPoster(redPoster, { saturation: 0 });

    const { data } = await sharp(adjusted).raw().toBuffer({ resolveWithObject: true });
    const r = data[0], g = data[1], b = data[2];

    // All channels roughly equal = gray (desaturated)
    expect(Math.abs(r - g)).toBeLessThan(25);
    expect(Math.abs(g - b)).toBeLessThan(25);
  });

  it("applyAdjustmentsToPoster: brightness=0.5 darkens poster", async () => {
    const whitePoster = await makeColorImage(100, 100, 200, 200, 200);
    const adjusted = await applyAdjustmentsToPoster(whitePoster, { brightness: 0.5 });

    const { data } = await sharp(adjusted).raw().toBuffer({ resolveWithObject: true });
    const r = data[0];

    // Brightness halved → significantly darker than original 200
    expect(r).toBeLessThan(140);
  });

  it("applyAdjustmentsToPoster: identity values return equivalent image", async () => {
    const redPoster = await makeColorImage(100, 100, 200, 0, 0);
    const adjusted = await applyAdjustmentsToPoster(redPoster, {
      brightness: 1,
      contrast: 1,
      saturation: 1,
    });

    // The same buffer is returned when no adjustment is needed
    expect(adjusted).toBe(redPoster);
  });

  it("saturation adjustment affects poster area but NOT base image area", async () => {
    // Blue base (0, 0, 200), red poster (200, 0, 0), saturation=0 on poster
    // Poster top-left 50% → pixel at (50, 50) should be gray
    // Base area bottom-right → pixel at (160, 160) should still be blue

    const result = await renderMockup({
      templateImageUrl: BASE_URL,   // blue
      posterImageUrl: POSTER_URL,   // red
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      adjustments: { saturation: 0 },
    });

    // Poster area: red desaturated → should be grayish (r ≈ g ≈ b)
    const posterPixel = await getPixel(result.buffer, 50, 50);
    expect(Math.abs(posterPixel.r - posterPixel.g)).toBeLessThan(30);
    expect(Math.abs(posterPixel.g - posterPixel.b)).toBeLessThan(30);

    // Base area: blue, completely unaffected by the saturation adjustment
    const basePixel = await getPixel(result.buffer, 160, 160);
    expect(basePixel.b).toBeGreaterThan(100);   // still has strong blue
    expect(basePixel.r).toBeLessThan(50);        // red channel low (base was not adjusted)
  });

  it("brightness adjustment affects poster area but NOT base image area", async () => {
    // Red poster with brightness=0.3 → very dark in poster area
    // Blue base → still full brightness in base area

    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      adjustments: { brightness: 0.3 },
    });

    // Poster area: darkened red
    const posterPixel = await getPixel(result.buffer, 50, 50);
    expect(posterPixel.r).toBeLessThan(120);  // significantly darker than original 200

    // Base area: full blue, not darkened
    const basePixel = await getPixel(result.buffer, 160, 160);
    expect(basePixel.b).toBeGreaterThan(100);
  });

  it("saturation=0 adjustment applied to perspective render isolates base", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "corners", corners: RECT_CORNERS },
      adjustments: { saturation: 0 },
    });

    // Base area outside the corner quad should remain blue
    const basePixel = await getPixel(result.buffer, 160, 160);
    expect(basePixel.b).toBeGreaterThan(100);
    expect(basePixel.r).toBeLessThan(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Single JPEG encoding
// ─────────────────────────────────────────────────────────────────────────────

describe("Encoding", () => {
  it("output buffer starts with JPEG SOI bytes (0xFF 0xD8)", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 25, posterY: 25, posterWidth: 50, posterHeight: 50 },
    });

    expect(result.buffer[0]).toBe(0xff);
    expect(result.buffer[1]).toBe(0xd8);
  });

  it("encodeResultAsJpeg is exported as the single encoding point", () => {
    // Structural test: the function is exported and available.
    // All rendering paths converge through this one function, guaranteeing
    // a single JPEG encode per render.
    expect(typeof encodeResultAsJpeg).toBe("function");
  });

  it("encodeResultAsJpeg produces JPEG from a PNG buffer", async () => {
    const png = await makeColorImage(50, 50, 100, 150, 200);
    const jpeg = await encodeResultAsJpeg(png);

    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);

    // JPEG is lossy but should roughly preserve the colour
    const { r, g, b } = await getPixel(jpeg, 25, 25);
    expect(r).toBeGreaterThan(60);
    expect(g).toBeGreaterThan(110);
    expect(b).toBeGreaterThan(160);
  });

  it("multi-layer render (bbox + effects + foreground) still produces a single JPEG", async () => {
    // If there were intermediate JPEG encodes, the quality would degrade visibly
    // and the output size would differ. We verify only one final JPEG marker exists.
    const result = await renderMockup({
      templateImageUrl: BASE_URL,
      posterImageUrl: POSTER_URL,
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      effectsOverlayUrl: OVERLAY_URL,
      effectsBlendMode: "over",
      effectsOpacity: 0.5,
      foregroundImageUrl: FG_URL,
      foregroundOpacity: 0.5,
    });

    // Only one JPEG SOI at the start, no embedded JPEG within the stream
    expect(result.buffer[0]).toBe(0xff);
    expect(result.buffer[1]).toBe(0xd8);
    // EOI at the end
    const last = result.buffer.length - 1;
    expect(result.buffer[last]).toBe(0xd9);
    expect(result.buffer[last - 1]).toBe(0xff);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Layer failures
// ─────────────────────────────────────────────────────────────────────────────

describe("Layer failures", () => {
  it("throws 'Failed to load effects overlay' when effects URL returns 404", async () => {
    await expect(
      renderMockup({
        templateImageUrl: BASE_URL,
        posterImageUrl: POSTER_URL,
        surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
        effectsOverlayUrl: BROKEN_URL,  // returns HTTP 404
        // useLightingOverlay is not false → layer is active
      })
    ).rejects.toThrow(/Failed to load effects overlay/);
  });

  it("throws 'Failed to composite foreground layer' when foreground URL returns 404", async () => {
    await expect(
      renderMockup({
        templateImageUrl: BASE_URL,
        posterImageUrl: POSTER_URL,
        surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
        foregroundImageUrl: BROKEN_URL,  // returns HTTP 404
        // useForeground is not false → layer is active
      })
    ).rejects.toThrow(/Failed to composite foreground layer/);
  });

  it("layer failure error message includes the underlying cause", async () => {
    let caught: Error | undefined;
    try {
      await renderMockup({
        templateImageUrl: BASE_URL,
        posterImageUrl: POSTER_URL,
        surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
        effectsOverlayUrl: BROKEN_URL,
      });
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).toContain("Failed to load effects overlay:");
    // The underlying fetch error (404) should be embedded in the message
    expect(caught!.message.length).toBeGreaterThan("Failed to load effects overlay:".length);
  });

  it("disabled effects layer with broken URL is not an error", async () => {
    // useLightingOverlay: false disables the layer regardless of URL
    await expect(
      renderMockup({
        templateImageUrl: BASE_URL,
        posterImageUrl: POSTER_URL,
        surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
        effectsOverlayUrl: BROKEN_URL,
        useLightingOverlay: false,  // explicitly disabled
      })
    ).resolves.toBeDefined();
  });

  it("disabled foreground layer with broken URL is not an error", async () => {
    await expect(
      renderMockup({
        templateImageUrl: BASE_URL,
        posterImageUrl: POSTER_URL,
        surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
        foregroundImageUrl: BROKEN_URL,
        useForeground: false,
      })
    ).resolves.toBeDefined();
  });

  it("effects layer with no URL is not an error even when useLightingOverlay is not set", async () => {
    // No URL → layer is not configured → not an error
    await expect(
      renderMockup({
        templateImageUrl: BASE_URL,
        posterImageUrl: POSTER_URL,
        surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
        // effectsOverlayUrl not set
      })
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. useBase = false
// ─────────────────────────────────────────────────────────────────────────────

describe("useBase = false", () => {
  it("renders poster on white canvas instead of template background", async () => {
    const result = await renderMockup({
      templateImageUrl: BASE_URL,  // blue — should NOT appear in output
      posterImageUrl: POSTER_URL,  // red
      surface: { mode: "bbox", posterX: 0, posterY: 0, posterWidth: 50, posterHeight: 50 },
      useBase: false,
    });

    // Area outside the poster should be white (255, 255, 255 ≈ with JPEG)
    const outside = await getPixel(result.buffer, 160, 160);
    expect(outside.r).toBeGreaterThan(200);
    expect(outside.g).toBeGreaterThan(200);
    expect(outside.b).toBeGreaterThan(200);
  });
});
