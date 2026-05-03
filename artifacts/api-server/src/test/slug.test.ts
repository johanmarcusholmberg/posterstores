import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import { postersTable, posterSizesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateSlug } from "../lib/migrateSlugField";
import { TEST_STORE_KEY } from "./setup";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "test-admin-token";
const ALT_STORE_KEY = "postsofsweden";

const adminHeaders = {
  "Content-Type": "application/json",
  "X-Admin-Token": ADMIN_TOKEN,
};

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    storeKey: TEST_STORE_KEY,
    title: "Test Slug Poster",
    description: "A test poster for slug tests",
    imageUrl: "https://example.com/test.jpg",
    category: "test",
    price: 29.99,
    currency: "EUR",
    status: "published",
    posterSizes: [{ sizeLabel: "A4", price: 29.99, currency: "EUR", active: true, sortOrder: 0 }],
    ...overrides,
  };
}

const createdIds: number[] = [];

async function cleanupCreated() {
  for (const id of createdIds) {
    await db.delete(posterSizesTable).where(eq(posterSizesTable.posterId, id)).catch(() => {});
    await db.delete(postersTable).where(eq(postersTable.id, id)).catch(() => {});
  }
  createdIds.length = 0;
}

afterEach(async () => {
  await cleanupCreated();
});

// ─── Slug generation utility ──────────────────────────────────────────────────

describe("generateSlug()", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(generateSlug("Valencia Sunset")).toBe("valencia-sunset");
  });

  it("strips diacritics", () => {
    expect(generateSlug("Valencia Orange Café Poster")).toBe("valencia-orange-cafe-poster");
    expect(generateSlug("Sevilla Terracota")).toBe("sevilla-terracota");
  });

  it("removes non-alphanumeric characters", () => {
    expect(generateSlug("Hello, World!")).toBe("hello-world");
  });

  it("collapses multiple dashes", () => {
    expect(generateSlug("foo  --  bar")).toBe("foo-bar");
  });

  it("trims leading and trailing dashes", () => {
    expect(generateSlug("  hello  ")).toBe("hello");
  });
});

// ─── Migration: existing posters get slugs ────────────────────────────────────

describe("GET /api/posters (slug presence)", () => {
  it("all published posters in the store have a non-null slug", async () => {
    const res = await request(app)
      .get(`/api/posters?storeKey=${TEST_STORE_KEY}&status=published`)
      .set(adminHeaders)
      .expect(200);

    const { posters } = res.body;
    expect(posters.length).toBeGreaterThan(0);
    for (const poster of posters) {
      expect(poster.slug).toBeTruthy();
      expect(typeof poster.slug).toBe("string");
    }
  });
});

// ─── Admin: slug auto-generation and CRUD ─────────────────────────────────────

describe("POST /api/posters — slug handling", () => {
  it("auto-generates a slug from title when none is provided", async () => {
    const res = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ title: "Auto Slug Poster" }))
      .expect(201);

    createdIds.push(res.body.id);
    expect(res.body.slug).toBe("auto-slug-poster");
  });

  it("uses provided slug when supplied", async () => {
    const res = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "my-custom-slug" }))
      .expect(201);

    createdIds.push(res.body.id);
    expect(res.body.slug).toBe("my-custom-slug");
  });

  it("rejects duplicate slug within same store", async () => {
    const first = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "duplicate-slug-test", title: "First Poster" }))
      .expect(201);
    createdIds.push(first.body.id);

    const second = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "duplicate-slug-test", title: "Second Poster" }))
      .expect(409);

    expect(second.body.error).toMatch(/slug.*already in use/i);
  });

  it("allows same slug in a different store", async () => {
    const first = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "cross-store-slug", storeKey: TEST_STORE_KEY }))
      .expect(201);
    createdIds.push(first.body.id);

    const second = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "cross-store-slug", storeKey: ALT_STORE_KEY }))
      .expect(201);
    createdIds.push(second.body.id);

    expect(first.body.slug).toBe("cross-store-slug");
    expect(second.body.slug).toBe("cross-store-slug");
  });

  it("rejects an invalid slug format", async () => {
    const res = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "Invalid Slug!!!" }))
      .expect(400);

    expect(res.body.error).toBeTruthy();
  });
});

describe("PUT /api/posters/:id — slug update", () => {
  it("allows updating slug to a new valid value", async () => {
    const created = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "old-slug-value" }))
      .expect(201);
    createdIds.push(created.body.id);

    const updated = await request(app)
      .put(`/api/posters/${created.body.id}?storeKey=${TEST_STORE_KEY}`)
      .set(adminHeaders)
      .send({ slug: "new-slug-value" })
      .expect(200);

    expect(updated.body.slug).toBe("new-slug-value");
  });

  it("rejects updating slug to one already used in same store", async () => {
    const first = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "taken-slug", title: "Poster A" }))
      .expect(201);
    createdIds.push(first.body.id);

    const second = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "other-slug", title: "Poster B" }))
      .expect(201);
    createdIds.push(second.body.id);

    const res = await request(app)
      .put(`/api/posters/${second.body.id}?storeKey=${TEST_STORE_KEY}`)
      .set(adminHeaders)
      .send({ slug: "taken-slug" })
      .expect(409);

    expect(res.body.error).toMatch(/slug.*already in use/i);
  });
});

// ─── Public: by-slug route ────────────────────────────────────────────────────

describe("GET /api/posters/by-slug/:slug", () => {
  it("returns the correct published poster for the active store", async () => {
    const created = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "public-slug-test", status: "published" }))
      .expect(201);
    createdIds.push(created.body.id);

    const res = await request(app)
      .get(`/api/posters/by-slug/public-slug-test?storeKey=${TEST_STORE_KEY}`)
      .expect(200);

    expect(res.body.id).toBe(created.body.id);
    expect(res.body.slug).toBe("public-slug-test");
  });

  it("returns 404 for a slug that belongs to a different store", async () => {
    const created = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "wrong-store-slug", storeKey: ALT_STORE_KEY, status: "published" }))
      .expect(201);
    createdIds.push(created.body.id);

    await request(app)
      .get(`/api/posters/by-slug/wrong-store-slug?storeKey=${TEST_STORE_KEY}`)
      .expect(404);
  });

  it("returns 404 for a draft poster slug", async () => {
    const created = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "draft-slug-test", status: "draft" }))
      .expect(201);
    createdIds.push(created.body.id);

    await request(app)
      .get(`/api/posters/by-slug/draft-slug-test?storeKey=${TEST_STORE_KEY}`)
      .expect(404);
  });

  it("returns 400 when storeKey is missing", async () => {
    await request(app)
      .get("/api/posters/by-slug/some-slug")
      .expect(400);
  });
});

// ─── Backward compatibility: ID-based route still works ──────────────────────

describe("GET /api/posters/:id — backward compat", () => {
  it("still returns a poster by numeric ID", async () => {
    const created = await request(app)
      .post("/api/posters")
      .set(adminHeaders)
      .send(basePayload({ slug: "compat-slug" }))
      .expect(201);
    createdIds.push(created.body.id);

    const res = await request(app)
      .get(`/api/posters/${created.body.id}?storeKey=${TEST_STORE_KEY}`)
      .set(adminHeaders)
      .expect(200);

    expect(res.body.id).toBe(created.body.id);
    expect(res.body.slug).toBe("compat-slug");
  });
});
