import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie } from "./setup";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import {
  postersTable,
  posterSizesTable,
  mockupTemplatesTable,
  posterMockupsTable,
} from "@workspace/db";
import { seedPostsofSpain } from "../lib/seedPostsofSpain";
import { eq } from "drizzle-orm";


let adminCookie = "";

const STORE_KEY = "postsofspain";

beforeAll(async () => {
  await seedPostsofSpain();
  adminCookie = await getAdminCookie();
});

// ── POLISH 1: Product detail trust block ─────────────────────────────────────

describe("POLISH 1 — Product detail page data", () => {
  it("poster detail API returns poster with active sizes for trust block", async () => {
    const posterRes = await request(app)
      .post("/api/posters")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({
        storeKey: STORE_KEY,
        title: "Trust Block Test Poster",
        imageUrl: "https://example.com/test.jpg",
        price: 29,
        currency: "EUR",
        category: "Spanish Cities",
        region: "Valencia",
        status: "published",
        posterSizes: [
          { sizeLabel: "30x40cm", price: 29, currency: "EUR", active: true },
        ],
      });
    expect(posterRes.status).toBe(201);

    const poster = posterRes.body;
    const res = await request(app).get(
      `/api/posters/${poster.id}?storeKey=${STORE_KEY}`
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(poster.id);
    expect(Array.isArray(res.body.posterSizes)).toBe(true);
    expect(res.body.posterSizes.length).toBeGreaterThan(0);
    expect(res.body.posterSizes[0].active).toBe(true);
    expect(res.body.lowestActivePrice).toBeDefined();

    await db.delete(postersTable).where(eq(postersTable.id, poster.id));
  });
});

// ── POLISH 4: Shop empty state when filters match nothing ────────────────────

describe("POLISH 4 — Shop empty state", () => {
  it("returns empty posters array for nonexistent region filter", async () => {
    const res = await request(app).get(
      `/api/posters?storeKey=${STORE_KEY}&region=NonExistentRegionXYZ123&limit=10`
    );
    expect(res.status).toBe(200);
    expect(res.body.posters).toBeDefined();
    expect(Array.isArray(res.body.posters)).toBe(true);
    expect(res.body.posters.length).toBe(0);
    expect(res.body.total).toBe(0);
  });

  it("returns empty posters array for nonexistent category filter", async () => {
    const res = await request(app).get(
      `/api/posters?storeKey=${STORE_KEY}&category=NonExistentCategoryXYZ123&limit=10`
    );
    expect(res.status).toBe(200);
    expect(res.body.posters.length).toBe(0);
  });

  it("returns empty posters array for nonexistent search query", async () => {
    const res = await request(app).get(
      `/api/posters?storeKey=${STORE_KEY}&search=zzz_nonexistent_query_xyz_abc&limit=10`
    );
    expect(res.status).toBe(200);
    expect(res.body.posters.length).toBe(0);
  });
});

// ── POLISH 8: Admin poster readiness indicators ───────────────────────────────

describe("POLISH 8 — Admin readiness indicators", () => {
  it("poster without master file and no sizes is flagged as not-ready in list", async () => {
    const createRes = await request(app)
      .post("/api/posters")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({
        storeKey: STORE_KEY,
        title: "Readiness Test — No Sizes No Master",
        imageUrl: "https://example.com/test-readiness.jpg",
        price: 29,
        currency: "EUR",
        category: "Spanish Cities",
        region: "Valencia",
        status: "draft",
      });
    expect(createRes.status).toBe(201);
    const poster = createRes.body;

    const listRes = await request(app)
      .get(`/api/posters?storeKey=${STORE_KEY}&status=draft`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(listRes.status).toBe(200);

    const found = listRes.body.posters.find((p: any) => p.id === poster.id);
    expect(found).toBeTruthy();
    expect(found.masterPrintImageUrl).toBeFalsy();
    const activeSizes = (found.posterSizes ?? []).filter((s: any) => s.active);
    expect(activeSizes.length).toBe(0);
    expect(found.status).toBe("draft");

    await db.delete(postersTable).where(eq(postersTable.id, poster.id));
  });

  it("poster with master file and active sizes shows no readiness issues", async () => {
    const createRes = await request(app)
      .post("/api/posters")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({
        storeKey: STORE_KEY,
        title: "Readiness Test — All Set",
        imageUrl: "https://example.com/test-all-set.jpg",
        masterPrintImageUrl: "https://example.com/master.jpg",
        price: 39,
        currency: "EUR",
        category: "Spanish Cities",
        region: "Andalusia",
        status: "published",
        posterSizes: [
          { sizeLabel: "50x70cm", price: 39, currency: "EUR", active: true },
        ],
      });
    expect(createRes.status).toBe(201);
    const poster = createRes.body;

    const res = await request(app)
      .get(`/api/posters/${poster.id}?storeKey=${STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.masterPrintImageUrl).toBeTruthy();
    const activeSizes = (res.body.posterSizes ?? []).filter((s: any) => s.active);
    expect(activeSizes.length).toBeGreaterThan(0);
    expect(res.body.status).toBe("published");

    await db.delete(postersTable).where(eq(postersTable.id, poster.id));
  });
});

// ── POLISH 9: Public mockup gallery skips empty placeholders ─────────────────

describe("POLISH 9 — Public mockup gallery placeholder safety", () => {
  let testPosterId: number;
  let templateWithNoPreviewId: number;
  let templateWithPreviewId: number;

  beforeAll(async () => {
    const posterRes = await request(app)
      .post("/api/posters")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({
        storeKey: STORE_KEY,
        title: "Mockup Placeholder Test Poster",
        imageUrl: "https://example.com/mockup-test.jpg",
        price: 29,
        currency: "EUR",
        category: "Spanish Cities",
        region: "Valencia",
        status: "published",
      });
    expect(posterRes.status).toBe(201);
    testPosterId = posterRes.body.id;

    const [templateNoPreview] = await db
      .insert(mockupTemplatesTable)
      .values({
        name: "Empty Placeholder Template",
        templateKey: `empty-placeholder-${Date.now()}`,
        frameType: "flat",
        previewThumbnailUrl: null,
        active: true,
      })
      .returning();
    templateWithNoPreviewId = templateNoPreview.id;

    const [templateWithPreview] = await db
      .insert(mockupTemplatesTable)
      .values({
        name: "Real Template",
        templateKey: `real-template-${Date.now()}`,
        frameType: "flat",
        previewThumbnailUrl: "https://example.com/preview-thumb.jpg",
        active: true,
      })
      .returning();
    templateWithPreviewId = templateWithPreview.id;
  });

  it("poster mockup with no image and no template preview is a placeholder", async () => {
    await db.insert(posterMockupsTable).values({
      posterId: testPosterId,
      mockupTemplateId: templateWithNoPreviewId,
      mockupImageUrl: null,
      isPrimary: false,
      sortOrder: 1,
    });

    const res = await request(app).get(
      `/api/posters/${testPosterId}/mockups?storeKey=${STORE_KEY}`
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const placeholderMockup = res.body.find(
      (m: any) => m.mockupTemplateId === templateWithNoPreviewId
    );
    expect(placeholderMockup).toBeTruthy();
    expect(placeholderMockup.mockupImageUrl).toBeNull();
    expect(placeholderMockup.template?.previewThumbnailUrl).toBeNull();
  });

  it("poster mockup with template preview URL is not a placeholder", async () => {
    await db.insert(posterMockupsTable).values({
      posterId: testPosterId,
      mockupTemplateId: templateWithPreviewId,
      mockupImageUrl: null,
      isPrimary: true,
      sortOrder: 2,
    });

    const res = await request(app).get(
      `/api/posters/${testPosterId}/mockups?storeKey=${STORE_KEY}`
    );
    expect(res.status).toBe(200);

    const validMockup = res.body.find(
      (m: any) => m.mockupTemplateId === templateWithPreviewId
    );
    expect(validMockup).toBeTruthy();
    expect(validMockup.template?.previewThumbnailUrl).toBe(
      "https://example.com/preview-thumb.jpg"
    );
  });

  it("poster mockup with custom mockupImageUrl is never a placeholder", async () => {
    const [mockupWithImage] = await db
      .insert(posterMockupsTable)
      .values({
        posterId: testPosterId,
        mockupTemplateId: templateWithNoPreviewId,
        mockupImageUrl: "https://example.com/custom-mockup.jpg",
        isPrimary: false,
        sortOrder: 3,
      })
      .returning();

    const res = await request(app).get(
      `/api/posters/${testPosterId}/mockups?storeKey=${STORE_KEY}`
    );
    expect(res.status).toBe(200);

    const customMockup = res.body.find(
      (m: any) => m.id === mockupWithImage.id
    );
    expect(customMockup).toBeTruthy();
    expect(customMockup.mockupImageUrl).toBe(
      "https://example.com/custom-mockup.jpg"
    );
  });

  afterAll(async () => {
    if (testPosterId) {
      await db
        .delete(posterMockupsTable)
        .where(eq(posterMockupsTable.posterId, testPosterId));
      await db
        .delete(postersTable)
        .where(eq(postersTable.id, testPosterId));
    }
    if (templateWithNoPreviewId) {
      await db
        .delete(mockupTemplatesTable)
        .where(eq(mockupTemplatesTable.id, templateWithNoPreviewId));
    }
    if (templateWithPreviewId) {
      await db
        .delete(mockupTemplatesTable)
        .where(eq(mockupTemplatesTable.id, templateWithPreviewId));
    }
  });
});

// ── POLISH 2 + 3: Checkout step indicator and cart data ──────────────────────

describe("POLISH 2 + 3 — Checkout / cart API", () => {
  it("cart returns items with poster image, title, size, price information", async () => {
    const sessionId = `test-session-ux-polish-${Date.now()}`;

    const posterRes = await request(app)
      .post("/api/posters")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({
        storeKey: STORE_KEY,
        title: "Cart Clarity Test Poster",
        imageUrl: "https://example.com/cart-test.jpg",
        price: 35,
        currency: "EUR",
        category: "Spanish Cities",
        region: "Catalonia",
        status: "published",
        posterSizes: [
          { sizeLabel: "50x70cm", price: 35, currency: "EUR", active: true },
        ],
      });
    expect(posterRes.status).toBe(201);
    const poster = posterRes.body;
    const sizeId = poster.posterSizes?.[0]?.id;

    await request(app)
      .post("/api/cart/items")
      .send({
        sessionId,
        storeKey: STORE_KEY,
        posterId: poster.id,
        quantity: 1,
        posterSizeId: sizeId,
        size: "50x70cm",
      });

    const cartRes = await request(app).get(
      `/api/cart?sessionId=${sessionId}&storeKey=${STORE_KEY}`
    );
    expect(cartRes.status).toBe(200);
    expect(cartRes.body.items.length).toBeGreaterThan(0);

    const item = cartRes.body.items[0];
    expect(item.poster).toBeTruthy();
    expect(item.poster.title).toBe("Cart Clarity Test Poster");
    expect(item.poster.imageUrl).toBeTruthy();
    expect(item.quantity).toBe(1);
    expect(cartRes.body.total).toBeGreaterThan(0);

    await db.delete(postersTable).where(eq(postersTable.id, poster.id));
  });
});

// ── POLISH 10: Microcopy — shipping methods available ───────────────────────

describe("POLISH 10 — Shipping methods for checkout", () => {
  it("returns shipping methods array for postsofspain", async () => {
    const res = await request(app).get(
      `/api/shipping-methods?storeKey=${STORE_KEY}`
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
