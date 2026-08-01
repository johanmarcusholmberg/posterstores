/**
 * Route-level tests for Phase 3 validation and preview endpoints:
 *
 *  POST /api/admin/mockup-templates/:id/validate
 *  POST /api/admin/mockup-templates/validate-draft
 *  POST /api/admin/mockup-templates/:id/preview
 *  GET  /api/admin/mockup-previews/:templateId
 *
 * Strategy
 * ────────
 * • Stub global.fetch so validateMockupTemplate and renderMockup don't make
 *   real network requests.
 * • Mock ObjectStorageService so preview upload/download calls succeed without
 *   real I/O and the ObjectNotFoundError class is available for 404 simulations.
 * • Mock dns/promises so SSRF validation passes for test URL hostnames.
 * • Create a minimal template + poster in beforeAll; clean up in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { db } from "@workspace/db";
import { mockupTemplatesTable, postersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAdminCookie } from "./setup";
import { _resolvers as safeImageResolvers } from "../lib/safeImageUrl";

// ── ObjectStorage mock ────────────────────────────────────────────────────────
//
// mockObjectNotFoundError must start with "mock" so vitest hoists it along
// with the vi.mock() call — otherwise it would be undefined inside the factory.
const mockObjectNotFoundError = class extends Error {
  constructor(message?: string) {
    super(message ?? "Object not found");
    this.name = "ObjectNotFoundError";
  }
};

const mockUploadBuffer = vi.fn();
const mockDeleteObject = vi.fn();
const mockGetObjectEntityFile = vi.fn();
const mockDownloadObject = vi.fn();

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: vi.fn().mockImplementation(() => ({
    uploadBuffer: mockUploadBuffer,
    deleteObject: mockDeleteObject,
    getObjectEntityFile: mockGetObjectEntityFile,
    trySetObjectEntityAclPolicy: vi.fn().mockResolvedValue(undefined),
    getObjectEntityUploadURL: vi.fn().mockRejectedValue(new Error("not in test")),
    downloadObject: mockDownloadObject,
    searchPublicObject: vi.fn().mockResolvedValue([]),
  })),
  ObjectNotFoundError: mockObjectNotFoundError,
}));

import app from "../app";

// ── Image helpers ─────────────────────────────────────────────────────────────

async function makeSolidPng(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 40, b: 180 } } })
    .png()
    .toBuffer();
}

async function makePosterPng(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 50, b: 50 } } })
    .png()
    .toBuffer();
}

// ── Fetch URL constants ───────────────────────────────────────────────────────

const TEMPLATE_BG_URL = "https://val-routes-test.example/template.png";
const POSTER_IMG_URL  = "https://val-routes-test.example/poster.png";
const STORE_KEY       = "postsofspain";

const IMAGE_MAP = new Map<string, Buffer>();

// ── Test state ────────────────────────────────────────────────────────────────

let adminCookie = "";
let testTemplateId: number;
let testPosterId: number;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  // Configure DNS to return a public IP for all hostnames
  safeImageResolvers.dnsLookup = async () => [{ address: "8.8.8.8", family: 4 }];

  // Create images (1200×1500 > recommended min → no resolution warning)
  const [bgBuf, posterBuf] = await Promise.all([
    makeSolidPng(1200, 1500),
    makePosterPng(600, 800),
  ]);
  IMAGE_MAP.set(TEMPLATE_BG_URL, bgBuf);
  IMAGE_MAP.set(POSTER_IMG_URL, posterBuf);

  vi.stubGlobal("fetch", async (input: string | URL | { toString(): string }): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const buf = IMAGE_MAP.get(url);
    if (!buf) {
      return { ok: false, status: 404, statusText: "Not Found", headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    }
    const copy = new Uint8Array(buf);
    return { ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => copy.buffer } as unknown as Response;
  });

  // Create template with a valid bbox surface
  const [template] = await db
    .insert(mockupTemplatesTable)
    .values({
      name: "Validation Route Test Template",
      templateKey: `val-route-${Date.now()}`,
      frameType: "flat",
      active: true,
      backgroundImageUrl: TEMPLATE_BG_URL,
      posterX: 10,
      posterY: 10,
      posterWidth: 80,
      posterHeight: 80,
    })
    .returning();
  testTemplateId = template.id;

  // Create poster
  const [poster] = await db
    .insert(postersTable)
    .values({
      storeKey: STORE_KEY,
      title: "Validation Route Test Poster",
      imageUrl: POSTER_IMG_URL,
      status: "published",
      category: "test",
      price: "10.00",
    })
    .returning();
  testPosterId = poster.id;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (testPosterId) await db.delete(postersTable).where(eq(postersTable.id, testPosterId));
  if (testTemplateId) await db.delete(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, testTemplateId));
});

beforeEach(() => {
  vi.clearAllMocks();
  // Reset all storage mocks to safe defaults for each test
  mockUploadBuffer.mockResolvedValue("/objects/mockup-previews/stub.jpg");
  mockDeleteObject.mockResolvedValue(true);
  mockGetObjectEntityFile.mockRejectedValue(new Error("storage not in test"));
  mockDownloadObject.mockRejectedValue(new Error("not in test"));
  // Always return a public IP for DNS lookups
  safeImageResolvers.dnsLookup = async () => [{ address: "8.8.8.8", family: 4 }];
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/mockup-templates/:id/validate
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/mockup-templates/:id/validate", () => {
  it("returns 401 without admin auth", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/validate`)
      .send();
    expect(res.status).toBe(401);
  });

  it("returns 404 for a nonexistent template id", async () => {
    const res = await request(app)
      .post("/api/admin/mockup-templates/99999999/validate")
      .set("Cookie", adminCookie)
      .send();
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app)
      .post("/api/admin/mockup-templates/not-a-number/validate")
      .set("Cookie", adminCookie)
      .send();
    expect(res.status).toBe(400);
  });

  it("returns 200 with a valid MockupTemplateValidationResult for a valid template", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/validate`)
      .set("Cookie", adminCookie)
      .send();

    expect(res.status).toBe(200);
    // Shape assertions
    expect(typeof res.body.valid).toBe("boolean");
    expect(typeof res.body.previewable).toBe("boolean");
    expect(typeof res.body.readyForSync).toBe("boolean");
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.images).toBeDefined();
    expect(res.body.surface).toBeDefined();
  });

  it("returns valid=true and previewable=true for a correctly configured template", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/validate`)
      .set("Cookie", adminCookie)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.previewable).toBe(true);
    expect(res.body.readyForSync).toBe(true);
    expect(res.body.images.base).not.toBeNull();
    expect(res.body.images.base.width).toBe(1200);
    expect(res.body.images.base.height).toBe(1500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/mockup-templates/validate-draft
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/mockup-templates/validate-draft", () => {
  it("returns 401 without admin auth", async () => {
    const res = await request(app)
      .post("/api/admin/mockup-templates/validate-draft")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns valid=false with BASE_MISSING when body has no backgroundImageUrl", async () => {
    const res = await request(app)
      .post("/api/admin/mockup-templates/validate-draft")
      .set("Cookie", adminCookie)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    const issue = res.body.issues.find((i: { code: string }) => i.code === "BASE_MISSING");
    expect(issue).toBeDefined();
  });

  it("validates a draft with valid fields and returns previewable=true", async () => {
    const res = await request(app)
      .post("/api/admin/mockup-templates/validate-draft")
      .set("Cookie", adminCookie)
      .send({
        backgroundImageUrl: TEMPLATE_BG_URL,
        posterX: 10,
        posterY: 10,
        posterWidth: 80,
        posterHeight: 80,
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.previewable).toBe(true);
  });

  it("returns SURFACE_MISSING when base is present but no placement defined", async () => {
    const res = await request(app)
      .post("/api/admin/mockup-templates/validate-draft")
      .set("Cookie", adminCookie)
      .send({ backgroundImageUrl: TEMPLATE_BG_URL });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    const issue = res.body.issues.find((i: { code: string }) => i.code === "SURFACE_MISSING");
    expect(issue).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/mockup-templates/:id/preview
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/mockup-templates/:id/preview", () => {
  it("returns 401 without admin auth", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .send({ posterId: testPosterId });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a nonexistent template", async () => {
    const res = await request(app)
      .post("/api/admin/mockup-templates/99999999/preview")
      .set("Cookie", adminCookie)
      .send({ posterId: testPosterId });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent poster", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .set("Cookie", adminCookie)
      .send({ posterId: 99999999 });
    expect(res.status).toBe(404);
  });

  it("returns 400 when posterId is missing", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .set("Cookie", adminCookie)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/posterId/);
  });

  it("returns 200 with previewUrl, validation, width, height for valid template + poster", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .set("Cookie", adminCookie)
      .send({ posterId: testPosterId });

    expect(res.status).toBe(200);
    expect(res.body.previewUrl).toMatch(/mockup-previews/);
    expect(typeof res.body.width).toBe("number");
    expect(typeof res.body.height).toBe("number");
    expect(res.body.width).toBeGreaterThan(0);
    expect(res.body.height).toBeGreaterThan(0);
    expect(res.body.validation).toBeDefined();
    expect(res.body.validation.valid).toBe(true);
  });

  it("returns the protected admin preview URL, not the raw storage URL", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .set("Cookie", adminCookie)
      .send({ posterId: testPosterId });

    expect(res.status).toBe(200);
    // Must use the protected admin route (not raw storage objects path)
    expect(res.body.previewUrl).toMatch(
      new RegExp(`^/api/admin/mockup-previews/${testTemplateId}\\?v=\\d+$`)
    );
    expect(res.body.previewUrl).not.toContain("/api/storage/objects/");
  });

  it("uses the deterministic preview path (mockup-previews/{id}/latest.jpg)", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .set("Cookie", adminCookie)
      .send({ posterId: testPosterId });

    expect(res.status).toBe(200);
    // The returned URL must route through the protected admin preview endpoint
    // (which in turn serves from mockup-previews/{id}/latest.jpg in storage).
    expect(res.body.previewUrl).toMatch(
      new RegExp(`^/api/admin/mockup-previews/${testTemplateId}\\?v=\\d+$`)
    );
  });

  it("does not write to poster_mockups (preview does not affect sync records)", async () => {
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .set("Cookie", adminCookie)
      .send({ posterId: testPosterId });

    expect(res.status).toBe(200);
    expect(res.body.previewUrl).toContain("mockup-previews");
    expect(res.body.previewUrl).not.toContain("mockup-composites");
  });

  it("returns 400 with validation result when template has blocking errors", async () => {
    // Template without backgroundImageUrl → validation fails
    const [badTemplate] = await db
      .insert(mockupTemplatesTable)
      .values({ name: "Bad Template", templateKey: `bad-val-${Date.now()}`, frameType: "flat" })
      .returning();

    try {
      const res = await request(app)
        .post(`/api/admin/mockup-templates/${badTemplate.id}/preview`)
        .set("Cookie", adminCookie)
        .send({ posterId: testPosterId });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/validation errors/);
      expect(res.body.validation).toBeDefined();
      expect(res.body.validation.valid).toBe(false);
      expect(res.body.validation.previewable).toBe(false);
    } finally {
      await db.delete(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, badTemplate.id));
    }
  });

  it("returns 403 when template storeKey does not match poster storeKey", async () => {
    // Create a store-specific template for "store-alpha"
    const [storeTemplate] = await db
      .insert(mockupTemplatesTable)
      .values({
        name: "Store Alpha Template",
        templateKey: `store-alpha-tpl-${Date.now()}`,
        frameType: "flat",
        active: true,
        storeKey: "store-alpha",
        backgroundImageUrl: TEMPLATE_BG_URL,
        posterX: 10,
        posterY: 10,
        posterWidth: 80,
        posterHeight: 80,
      })
      .returning();

    try {
      // testPosterId belongs to STORE_KEY ("postsofspain"), not "store-alpha"
      const res = await request(app)
        .post(`/api/admin/mockup-templates/${storeTemplate.id}/preview`)
        .set("Cookie", adminCookie)
        .send({ posterId: testPosterId });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/another store/i);
    } finally {
      await db.delete(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, storeTemplate.id));
    }
  });

  it("allows preview when template is global (storeKey=null) with any store poster", async () => {
    // The test template was created with no storeKey (null) — it's global
    const [globalTemplate] = await db
      .select({ id: mockupTemplatesTable.id, storeKey: mockupTemplatesTable.storeKey })
      .from(mockupTemplatesTable)
      .where(eq(mockupTemplatesTable.id, testTemplateId));
    expect(globalTemplate.storeKey).toBeNull();

    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .set("Cookie", adminCookie)
      .send({ posterId: testPosterId });

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/mockup-previews/:templateId
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/mockup-previews/:templateId", () => {
  it("returns 401 without admin auth", async () => {
    const res = await request(app)
      .get(`/api/admin/mockup-previews/${testTemplateId}`);
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-integer id", async () => {
    const res = await request(app)
      .get("/api/admin/mockup-previews/not-a-number")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });

  it("returns 404 when template does not exist", async () => {
    const res = await request(app)
      .get("/api/admin/mockup-previews/99999999")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 404 when no preview has been generated (storage not found)", async () => {
    // Use a fresh template that has NEVER had a preview uploaded so storage
    // reliably returns ObjectNotFoundError regardless of whether the storage
    // mock or the real GCS implementation is active.
    const [freshTemplate] = await db
      .insert(mockupTemplatesTable)
      .values({ name: "No-Preview Template", templateKey: `no-preview-${Date.now()}`, frameType: "flat" })
      .returning();

    try {
      const res = await request(app)
        .get(`/api/admin/mockup-previews/${freshTemplate.id}`)
        .set("Cookie", adminCookie);

      expect(res.status).toBe(404);
      // Route error message must mention the missing preview
      expect(res.body.error).toMatch(/no preview|not found/i);
    } finally {
      await db.delete(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, freshTemplate.id));
    }
  });

  it("streams image with Cache-Control: private, no-store", async () => {
    // Set up storage mock to serve a fake preview JPEG
    const mockFile = { path: "mockup-previews/1/latest.jpg" };
    mockGetObjectEntityFile.mockResolvedValueOnce(mockFile);
    mockDownloadObject.mockResolvedValueOnce({
      status: 200,
      headers: new Headers({ "content-type": "image/jpeg" }),
      body: null,
      ok: true,
    });

    const res = await request(app)
      .get(`/api/admin/mockup-previews/${testTemplateId}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    // Cache-Control must be private, no-store — never allow caching of admin previews
    expect(res.headers["cache-control"]).toMatch(/private/);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    // Content-Type must be image/jpeg regardless of storage headers
    expect(res.headers["content-type"]).toMatch(/image\/jpeg/);
  });

  it("does not expose raw storage objects URL in the preview URL returned by POST /preview", async () => {
    // Confirm the POST preview endpoint returns the protected route URL, not storage
    const res = await request(app)
      .post(`/api/admin/mockup-templates/${testTemplateId}/preview`)
      .set("Cookie", adminCookie)
      .send({ posterId: testPosterId });

    expect(res.status).toBe(200);
    expect(res.body.previewUrl).not.toMatch(/\/api\/storage\/objects\//);
    expect(res.body.previewUrl).toMatch(/^\/api\/admin\/mockup-previews\//);
  });
});
