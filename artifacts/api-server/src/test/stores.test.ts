import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import { storesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "test-admin-token";
const adminHeaders = {
  "Content-Type": "application/json",
  "X-Admin-Token": ADMIN_TOKEN,
};

const TEST_STORE_KEY = "testvitest";
const TEST_STORE_KEY_2 = "testvitest2";

async function cleanupTestStores() {
  await db.delete(storesTable).where(eq(storesTable.storeKey, TEST_STORE_KEY)).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, TEST_STORE_KEY_2)).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, "badkey!")).catch(() => {});
}

afterEach(async () => {
  await cleanupTestStores();
});

function baseStorePayload(overrides: Record<string, unknown> = {}) {
  return {
    storeKey: TEST_STORE_KEY,
    name: "Test Vitest Store",
    countryFocus: "Testland",
    defaultCurrency: "EUR",
    defaultLanguage: "en",
    active: true,
    themeConfig: {
      background: "#FAF6EF",
      surface: "#FFFFFF",
      sand: "#E8D8C3",
      primary: "#2F80A8",
      secondary: "#C86B4A",
      text: "#1F2A33",
      muted: "#8A9A5B",
      border: "#E4DDD3",
    },
    homepageConfig: {
      heroTitle: "Posters inspired by Testland",
      heroSubtitle: "Beautiful test posters for your home.",
      regions: ["Region A", "Region B"],
      cities: ["City A", "City B"],
      categories: ["Cat 1", "Cat 2"],
      tags: ["tag1", "tag2"],
    },
    seoConfig: {
      defaultTitle: "Test Store — Art Posters",
      defaultDescription: "Discover beautifully printed test posters.",
    },
    ...overrides,
  };
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("GET /api/admin/stores — auth", () => {
  it("returns 401 without admin token", async () => {
    const res = await request(app).get("/api/admin/stores");
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid admin token", async () => {
    const res = await request(app).get("/api/admin/stores").set(adminHeaders);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── Create store ─────────────────────────────────────────────────────────────

describe("POST /api/admin/stores — create", () => {
  it("creates a new store with valid payload", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(baseStorePayload());

    expect(res.status).toBe(201);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
    expect(res.body.name).toBe("Test Vitest Store");
    expect(res.body.active).toBe(true);
    expect(res.body.themeConfig).toBeTruthy();
    expect(res.body.homepageConfig.heroTitle).toBe("Posters inspired by Testland");
    expect(res.body.seoConfig.defaultTitle).toBe("Test Store — Art Posters");
  });

  it("rejects duplicate storeKey with 409", async () => {
    await request(app).post("/api/admin/stores").set(adminHeaders).send(baseStorePayload());
    const res = await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(baseStorePayload());
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });

  it("rejects storeKey with invalid characters", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(baseStorePayload({ storeKey: "Bad-Key!" }));
    expect(res.status).toBe(400);
  });

  it("rejects storeKey with uppercase letters", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(baseStorePayload({ storeKey: "PostsofItaly" }));
    expect(res.status).toBe(400);
  });

  it("rejects storeKey with spaces", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(baseStorePayload({ storeKey: "posts of italy" }));
    expect(res.status).toBe(400);
  });

  it("rejects missing store name", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(baseStorePayload({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects missing currency", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(baseStorePayload({ defaultCurrency: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid hex color in themeConfig", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(
        baseStorePayload({
          themeConfig: {
            background: "not-a-color",
            surface: "#FFFFFF",
            sand: "#E8D8C3",
            primary: "#2F80A8",
            secondary: "#C86B4A",
            text: "#1F2A33",
            muted: "#8A9A5B",
            border: "#E4DDD3",
          },
        })
      );
    expect(res.status).toBe(400);
  });

  it("creates a store without token and gets 401", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Content-Type", "application/json")
      .send(baseStorePayload());
    expect(res.status).toBe(401);
  });
});

// ─── Get single store ─────────────────────────────────────────────────────────

describe("GET /api/admin/stores/:storeKey", () => {
  it("returns 404 for unknown store", async () => {
    const res = await request(app)
      .get("/api/admin/stores/nonexistent-store-xyz")
      .set(adminHeaders);
    expect(res.status).toBe(404);
  });

  it("returns created store by key", async () => {
    await request(app).post("/api/admin/stores").set(adminHeaders).send(baseStorePayload());
    const res = await request(app)
      .get(`/api/admin/stores/${TEST_STORE_KEY}`)
      .set(adminHeaders);
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
    expect(typeof res.body.posterCount).toBe("number");
    expect(typeof res.body.orderCount).toBe("number");
  });
});

// ─── Update store ─────────────────────────────────────────────────────────────

describe("PUT /api/admin/stores/:storeKey — edit", () => {
  it("updates store name and config", async () => {
    await request(app).post("/api/admin/stores").set(adminHeaders).send(baseStorePayload());

    const res = await request(app)
      .put(`/api/admin/stores/${TEST_STORE_KEY}`)
      .set(adminHeaders)
      .send({ name: "Updated Store Name", defaultCurrency: "SEK" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Store Name");
    expect(res.body.defaultCurrency).toBe("SEK");
  });

  it("rejects invalid hex color on update", async () => {
    await request(app).post("/api/admin/stores").set(adminHeaders).send(baseStorePayload());

    const res = await request(app)
      .put(`/api/admin/stores/${TEST_STORE_KEY}`)
      .set(adminHeaders)
      .send({
        themeConfig: {
          background: "red",
          surface: "#FFFFFF",
          sand: "#E8D8C3",
          primary: "#2F80A8",
          secondary: "#C86B4A",
          text: "#1F2A33",
          muted: "#8A9A5B",
          border: "#E4DDD3",
        },
      });
    expect(res.status).toBe(400);
  });

  it("returns 404 when updating non-existent store", async () => {
    const res = await request(app)
      .put("/api/admin/stores/nonexistent-store-xyz")
      .set(adminHeaders)
      .send({ name: "Nope" });
    expect(res.status).toBe(404);
  });
});

// ─── Deactivate store ─────────────────────────────────────────────────────────

describe("PATCH /api/admin/stores/:storeKey/deactivate", () => {
  it("deactivates a store with no posters/orders", async () => {
    await request(app).post("/api/admin/stores").set(adminHeaders).send(baseStorePayload());
    const res = await request(app)
      .patch(`/api/admin/stores/${TEST_STORE_KEY}/deactivate`)
      .set(adminHeaders);
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it("returns 404 for unknown store", async () => {
    const res = await request(app)
      .patch("/api/admin/stores/nonexistent-store-xyz/deactivate")
      .set(adminHeaders);
    expect(res.status).toBe(404);
  });
});

// ─── Public stores endpoint ───────────────────────────────────────────────────

describe("GET /api/stores — public", () => {
  it("returns only active stores", async () => {
    await request(app).post("/api/admin/stores").set(adminHeaders).send(baseStorePayload());
    await request(app)
      .post("/api/admin/stores")
      .set(adminHeaders)
      .send(baseStorePayload({ storeKey: TEST_STORE_KEY_2, name: "Test Store 2", active: false }));

    const res = await request(app).get("/api/stores");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const keys = res.body.map((s: { storeKey: string }) => s.storeKey);
    expect(keys).toContain(TEST_STORE_KEY);
    expect(keys).not.toContain(TEST_STORE_KEY_2);
  });
});

// ─── Public store config endpoint ─────────────────────────────────────────────

describe("GET /api/stores/:storeKey/config — public", () => {
  it("returns 404 for unknown store", async () => {
    const res = await request(app).get("/api/stores/nonexistent-store-xyz/config");
    expect(res.status).toBe(404);
  });

  it("returns full config for a created store", async () => {
    await request(app).post("/api/admin/stores").set(adminHeaders).send(baseStorePayload());

    const res = await request(app).get(`/api/stores/${TEST_STORE_KEY}/config`);
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
    expect(res.body.storeName).toBe("Test Vitest Store");
    expect(res.body.homepage.heroTitle).toBe("Posters inspired by Testland");
    expect(Array.isArray(res.body.regions)).toBe(true);
    expect(Array.isArray(res.body.cities)).toBe(true);
    expect(res.body.theme).toBeTruthy();
    expect(res.body.seo).toBeTruthy();
  });
});
