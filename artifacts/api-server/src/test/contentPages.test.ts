import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { getAdminCookie } from "./setup";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import { storeContentPagesTable, storesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

let adminCookie = "";
beforeAll(async () => { adminCookie = await getAdminCookie(); });

const TEST_STORE_KEY = "contentteststore";
const TEST_STORE_KEY_2 = "contentteststore2";

async function createTestStore(storeKey: string) {
  await request(app)
    .post("/api/admin/stores")
    .set("Cookie", adminCookie).set("Content-Type", "application/json")
    .send({
      storeKey,
      name: "Content Test Store",
      countryFocus: "Testland",
      defaultCurrency: "EUR",
      defaultLanguage: "en",
      active: true,
    });
}

async function cleanupTestData() {
  await db
    .delete(storeContentPagesTable)
    .where(eq(storeContentPagesTable.storeKey, TEST_STORE_KEY))
    .catch(() => {});
  await db
    .delete(storeContentPagesTable)
    .where(eq(storeContentPagesTable.storeKey, TEST_STORE_KEY_2))
    .catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, TEST_STORE_KEY)).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, TEST_STORE_KEY_2)).catch(() => {});
}

afterEach(async () => {
  await cleanupTestData();
});

// ── Auth guard ────────────────────────────────────────────────────────────────

describe("GET /api/admin/content — auth", () => {
  it("returns 401 without admin token", async () => {
    const res = await request(app).get(`/api/admin/content?storeKey=${TEST_STORE_KEY}`);
    expect(res.status).toBe(401);
  });

  it("requires storeKey parameter", async () => {
    const res = await request(app).get("/api/admin/content").set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/admin/content/:pageKey — auth", () => {
  it("returns 401 without admin token", async () => {
    const res = await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Content-Type", "application/json")
      .send({ title: "About", content: "Some content", published: true });
    expect(res.status).toBe(401);
  });
});

// ── Admin create/update ───────────────────────────────────────────────────────

describe("PUT /api/admin/content/:pageKey — create and update", () => {
  it("creates a new content page", async () => {
    await createTestStore(TEST_STORE_KEY);

    const res = await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({
        title: "About Us",
        subtitle: "Our story",
        content: "We make great posters.",
        metaTitle: "About | Test Store",
        metaDescription: "Learn about us.",
        published: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
    expect(res.body.pageKey).toBe("about");
    expect(res.body.title).toBe("About Us");
    expect(res.body.subtitle).toBe("Our story");
    expect(res.body.published).toBe(true);
  });

  it("updates an existing content page", async () => {
    await createTestStore(TEST_STORE_KEY);

    await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "About Us", content: "First version.", published: false });

    const res = await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "About Us Updated", content: "Second version.", published: true });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("About Us Updated");
    expect(res.body.content).toBe("Second version.");
    expect(res.body.published).toBe(true);
  });

  it("rejects invalid pageKey", async () => {
    await createTestStore(TEST_STORE_KEY);

    const res = await request(app)
      .put(`/api/admin/content/fakekey?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "Fake", content: "Content", published: true });

    expect(res.status).toBe(400);
  });

  it("rejects missing title", async () => {
    await createTestStore(TEST_STORE_KEY);

    const res = await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "", content: "Some content", published: false });

    expect(res.status).toBe(400);
  });

  it("rejects missing content", async () => {
    await createTestStore(TEST_STORE_KEY);

    const res = await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "About", content: "", published: false });

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent store", async () => {
    const res = await request(app)
      .put("/api/admin/content/about?storeKey=nonexistentstore999")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "About", content: "Content", published: true });

    expect(res.status).toBe(404);
  });
});

// ── Store scoping ─────────────────────────────────────────────────────────────

describe("Content pages are store-scoped", () => {
  it("content for one store is not visible for another store", async () => {
    await createTestStore(TEST_STORE_KEY);
    await createTestStore(TEST_STORE_KEY_2);

    await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "Store1 About", content: "Store 1 content.", published: true });

    const res = await request(app)
      .get(`/api/content/about?storeKey=${TEST_STORE_KEY_2}`);

    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(false);
  });

  it("each store gets its own content independently", async () => {
    await createTestStore(TEST_STORE_KEY);
    await createTestStore(TEST_STORE_KEY_2);

    await request(app)
      .put(`/api/admin/content/shipping?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "Shipping S1", content: "Ships from Spain.", published: true });

    await request(app)
      .put(`/api/admin/content/shipping?storeKey=${TEST_STORE_KEY_2}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "Shipping S2", content: "Ships from Sweden.", published: true });

    const res1 = await request(app).get(`/api/content/shipping?storeKey=${TEST_STORE_KEY}`);
    const res2 = await request(app).get(`/api/content/shipping?storeKey=${TEST_STORE_KEY_2}`);

    expect(res1.body.title).toBe("Shipping S1");
    expect(res2.body.title).toBe("Shipping S2");
  });
});

// ── Public endpoint ───────────────────────────────────────────────────────────

describe("GET /api/content/:pageKey — public", () => {
  it("returns published content for valid storeKey + pageKey", async () => {
    await createTestStore(TEST_STORE_KEY);

    await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "About", content: "Public content.", published: true });

    const res = await request(app).get(`/api/content/about?storeKey=${TEST_STORE_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.title).toBe("About");
    expect(res.body.content).toBe("Public content.");
    expect(res.body.published).toBe(true);
  });

  it("returns exists=false when no content row exists (fallback case)", async () => {
    await createTestStore(TEST_STORE_KEY);

    const res = await request(app).get(`/api/content/shipping?storeKey=${TEST_STORE_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(false);
  });

  it("does not return unpublished content to public", async () => {
    await createTestStore(TEST_STORE_KEY);

    await request(app)
      .put(`/api/admin/content/returns?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "Returns", content: "Draft returns policy.", published: false });

    const res = await request(app).get(`/api/content/returns?storeKey=${TEST_STORE_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(false);
  });

  it("rejects invalid pageKey", async () => {
    const res = await request(app).get(`/api/content/fakekey?storeKey=${TEST_STORE_KEY}`);
    expect(res.status).toBe(400);
  });
});

// ── Admin list endpoint ───────────────────────────────────────────────────────

describe("GET /api/admin/content — list pages", () => {
  it("lists all 6 page slots for a store", async () => {
    await createTestStore(TEST_STORE_KEY);

    const res = await request(app)
      .get(`/api/admin/content?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(6);

    const pageKeys = res.body.map((p: { pageKey: string }) => p.pageKey);
    expect(pageKeys).toContain("about");
    expect(pageKeys).toContain("shipping");
    expect(pageKeys).toContain("returns");
    expect(pageKeys).toContain("privacy");
    expect(pageKeys).toContain("terms");
    expect(pageKeys).toContain("contact");
  });

  it("shows hasFallback=true for pages with no content row", async () => {
    await createTestStore(TEST_STORE_KEY);

    await request(app)
      .put(`/api/admin/content/about?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "About", content: "Real content.", published: true });

    const res = await request(app)
      .get(`/api/admin/content?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    const about = res.body.find((p: { pageKey: string }) => p.pageKey === "about");
    const shipping = res.body.find((p: { pageKey: string }) => p.pageKey === "shipping");

    expect(about.hasFallback).toBe(false);
    expect(shipping.hasFallback).toBe(true);
  });

  it("admin get single page returns draft content", async () => {
    await createTestStore(TEST_STORE_KEY);

    await request(app)
      .put(`/api/admin/content/privacy?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "Privacy Draft", content: "Draft content.", published: false });

    const res = await request(app)
      .get(`/api/admin/content/privacy?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.published).toBe(false);
    expect(res.body.content).toBe("Draft content.");
  });
});

// ── Launch checklist ───────────────────────────────────────────────────────────

describe("Launch checklist — content pages section", () => {
  it("warns when content pages use fallback copy", async () => {
    await createTestStore(TEST_STORE_KEY);

    const res = await request(app)
      .get(`/api/admin/launch-checklist?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    const legalSection = res.body.sections.find((s: { id: string }) => s.id === "legal");
    expect(legalSection).toBeTruthy();

    const contentItem = legalSection.items.find((i: { id: string }) => i.id.startsWith("content-"));
    expect(contentItem).toBeTruthy();
    expect(["warning", "missing"].includes(contentItem.status)).toBe(true);
  });

  it("passes when a content page is published", async () => {
    await createTestStore(TEST_STORE_KEY);

    await request(app)
      .put(`/api/admin/content/shipping?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ title: "Shipping", content: "Our shipping policy.", published: true });

    const res = await request(app)
      .get(`/api/admin/launch-checklist?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    const legalSection = res.body.sections.find((s: { id: string }) => s.id === "legal");
    const shippingItem = legalSection.items.find((i: { id: string }) => i.id === "content-shipping");
    expect(shippingItem).toBeTruthy();
    expect(shippingItem.status).toBe("pass");
  });
});

// ── Regression: existing routes still work ────────────────────────────────────

describe("Regression — existing public pages still reachable", () => {
  it("GET /api/stores still works", async () => {
    const res = await request(app).get("/api/stores");
    expect(res.status).toBe(200);
  });

  it("GET /api/healthz still works", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
  });
});
