import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { getAdminCookie } from "./setup";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import { storesTable } from "@workspace/db";
import { eq } from "drizzle-orm";


let adminCookie = "";
beforeAll(async () => { adminCookie = await getAdminCookie(); });

const TEST_STORE_KEY = "testvitest";
const TEST_STORE_KEY_2 = "testvitest2";

async function cleanupTestStores() {
  await db.delete(storesTable).where(eq(storesTable.storeKey, TEST_STORE_KEY)).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, TEST_STORE_KEY_2)).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, "badkey!")).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, "testdomainstore")).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, "testprefixstore")).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, "testprefixstore2")).catch(() => {});
  await db.delete(storesTable).where(eq(storesTable.storeKey, "testdomainstore2")).catch(() => {});
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
    const res = await request(app).get("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── Create store ─────────────────────────────────────────────────────────────

describe("POST /api/admin/stores — create", () => {
  it("creates a new store with valid payload", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload());

    expect(res.status).toBe(201);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
    expect(res.body.name).toBe("Test Vitest Store");
    expect(res.body.active).toBe(true);
    expect(res.body.themeConfig).toBeTruthy();
    expect(res.body.homepageConfig.heroTitle).toBe("Posters inspired by Testland");
    expect(res.body.seoConfig.defaultTitle).toBe("Test Store — Art Posters");
  });

  it("creates a store with domain and route prefix", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(
        baseStorePayload({
          primaryDomain: "testland.com",
          domainAliases: ["www.testland.com"],
          routePrefix: "testland",
        })
      );

    expect(res.status).toBe(201);
    expect(res.body.primaryDomain).toBe("testland.com");
    expect(res.body.domainAliases).toEqual(["www.testland.com"]);
    expect(res.body.routePrefix).toBe("testland");
  });

  it("rejects duplicate storeKey with 409", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload());
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });

  it("rejects storeKey with invalid characters", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "Bad-Key!" }));
    expect(res.status).toBe(400);
  });

  it("rejects storeKey with uppercase letters", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "PostsofItaly" }));
    expect(res.status).toBe(400);
  });

  it("rejects storeKey with spaces", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "posts of italy" }));
    expect(res.status).toBe(400);
  });

  it("rejects missing store name", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects missing currency", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ defaultCurrency: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid hex color in themeConfig", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
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

  it("rejects invalid routePrefix", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ routePrefix: "Bad Prefix!" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid primaryDomain", async () => {
    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ primaryDomain: "not a domain" }));
    expect(res.status).toBe(400);
  });

  it("rejects duplicate routePrefix across stores", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "testprefixstore", routePrefix: "uniqueprefix" }));

    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "testprefixstore2", routePrefix: "uniqueprefix" }));

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("uniqueprefix");
  });

  it("rejects duplicate primaryDomain across stores", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "testdomainstore", primaryDomain: "unique-domain-test.com" }));

    const res = await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "testdomainstore2", primaryDomain: "unique-domain-test.com" }));

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("unique-domain-test.com");
  });
});

// ─── Get single store ─────────────────────────────────────────────────────────

describe("GET /api/admin/stores/:storeKey", () => {
  it("returns 404 for unknown store", async () => {
    const res = await request(app)
      .get("/api/admin/stores/nonexistent-store-xyz")
      .set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(res.status).toBe(404);
  });

  it("returns created store by key", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());
    const res = await request(app)
      .get(`/api/admin/stores/${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
    expect(typeof res.body.posterCount).toBe("number");
    expect(typeof res.body.orderCount).toBe("number");
  });

  it("returns domain/prefix fields in store response", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(
        baseStorePayload({
          primaryDomain: "testviteststore.com",
          domainAliases: ["www.testviteststore.com"],
          routePrefix: "testvitestprefix",
        })
      );

    const res = await request(app).get(`/api/admin/stores/${TEST_STORE_KEY}`).set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.primaryDomain).toBe("testviteststore.com");
    expect(res.body.domainAliases).toEqual(["www.testviteststore.com"]);
    expect(res.body.routePrefix).toBe("testvitestprefix");
  });
});

// ─── Update store ─────────────────────────────────────────────────────────────

describe("PUT /api/admin/stores/:storeKey — edit", () => {
  it("updates store name and config", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());

    const res = await request(app)
      .put(`/api/admin/stores/${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ name: "Updated Store Name", defaultCurrency: "SEK" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Store Name");
    expect(res.body.defaultCurrency).toBe("SEK");
  });

  it("saves domain and route prefix on update", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());

    const res = await request(app)
      .put(`/api/admin/stores/${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({
        primaryDomain: "updated-testland.com",
        domainAliases: ["www.updated-testland.com"],
        routePrefix: "updatedtestland",
      });

    expect(res.status).toBe(200);
    expect(res.body.primaryDomain).toBe("updated-testland.com");
    expect(res.body.domainAliases).toEqual(["www.updated-testland.com"]);
    expect(res.body.routePrefix).toBe("updatedtestland");
  });

  it("clears domain and prefix when set to null", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ primaryDomain: "templand.com", routePrefix: "templand" }));

    const res = await request(app)
      .put(`/api/admin/stores/${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ primaryDomain: null, routePrefix: null, domainAliases: null });

    expect(res.status).toBe(200);
    expect(res.body.primaryDomain).toBeNull();
    expect(res.body.routePrefix).toBeNull();
  });

  it("rejects duplicate routePrefix on update", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "testprefixstore", routePrefix: "myuniqprefix" }));
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: "testprefixstore2" }));

    const res = await request(app)
      .put("/api/admin/stores/testprefixstore2")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ routePrefix: "myuniqprefix" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("myuniqprefix");
  });

  it("rejects invalid hex color on update", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());

    const res = await request(app)
      .put(`/api/admin/stores/${TEST_STORE_KEY}`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
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
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send({ name: "Nope" });
    expect(res.status).toBe(404);
  });
});

// ─── Deactivate store ─────────────────────────────────────────────────────────

describe("PATCH /api/admin/stores/:storeKey/deactivate", () => {
  it("deactivates a store with no posters/orders", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());
    const res = await request(app)
      .patch(`/api/admin/stores/${TEST_STORE_KEY}/deactivate`)
      .set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it("returns 404 for unknown store", async () => {
    const res = await request(app)
      .patch("/api/admin/stores/nonexistent-store-xyz/deactivate")
      .set("Cookie", adminCookie).set("Content-Type", "application/json");
    expect(res.status).toBe(404);
  });
});

// ─── Public stores endpoint ───────────────────────────────────────────────────

describe("GET /api/stores — public", () => {
  it("returns only active stores", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ storeKey: TEST_STORE_KEY_2, name: "Test Store 2", active: false }));

    const res = await request(app).get("/api/stores");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const keys = res.body.map((s: { storeKey: string }) => s.storeKey);
    expect(keys).toContain(TEST_STORE_KEY);
    expect(keys).not.toContain(TEST_STORE_KEY_2);
  });

  it("includes domain and routePrefix in public store list", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(
        baseStorePayload({
          primaryDomain: "testvitestpublic.com",
          domainAliases: ["www.testvitestpublic.com"],
          routePrefix: "testvitestpublic",
        })
      );

    const res = await request(app).get("/api/stores");
    expect(res.status).toBe(200);
    const store = res.body.find((s: { storeKey: string }) => s.storeKey === TEST_STORE_KEY);
    expect(store).toBeTruthy();
    expect(store.primaryDomain).toBe("testvitestpublic.com");
    expect(store.routePrefix).toBe("testvitestpublic");
  });
});

// ─── Public store config endpoint ─────────────────────────────────────────────

describe("GET /api/stores/:storeKey/config — public", () => {
  it("returns 404 for unknown store", async () => {
    const res = await request(app).get("/api/stores/nonexistent-store-xyz/config");
    expect(res.status).toBe(404);
  });

  it("returns full config for a created store", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());

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

  it("includes domain/prefix fields in store config", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(
        baseStorePayload({
          primaryDomain: "configtest.com",
          domainAliases: ["www.configtest.com"],
          routePrefix: "configtest",
        })
      );

    const res = await request(app).get(`/api/stores/${TEST_STORE_KEY}/config`);
    expect(res.status).toBe(200);
    expect(res.body.primaryDomain).toBe("configtest.com");
    expect(res.body.domainAliases).toEqual(["www.configtest.com"]);
    expect(res.body.routePrefix).toBe("configtest");
  });
});

// ─── Store resolver endpoint ──────────────────────────────────────────────────

describe("GET /api/stores/resolve", () => {
  it("resolves by route prefix", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ routePrefix: "resolvertest" }));

    const res = await request(app).get("/api/stores/resolve?prefix=resolvertest");
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
  });

  it("resolves by primary domain", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ primaryDomain: "resolvertest.com" }));

    const res = await request(app).get("/api/stores/resolve?domain=resolvertest.com");
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
  });

  it("resolves by www domain alias", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(
        baseStorePayload({
          primaryDomain: "resolveralias.com",
          domainAliases: ["www.resolveralias.com"],
        })
      );

    const res = await request(app).get("/api/stores/resolve?domain=www.resolveralias.com");
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
  });

  it("falls back to specified store for unknown domain", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());

    const res = await request(app).get(
      `/api/stores/resolve?domain=totally-unknown-xyz-domain.com&fallback=${TEST_STORE_KEY}`
    );
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
  });

  it("resolves by prefix over domain when both provided", async () => {
    await request(app)
      .post("/api/admin/stores")
      .set("Cookie", adminCookie).set("Content-Type", "application/json")
      .send(baseStorePayload({ routePrefix: "resolverpriority", primaryDomain: "resolverpriority.com" }));

    const res = await request(app).get(
      "/api/stores/resolve?prefix=resolverpriority&domain=some-other-domain.com"
    );
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
  });
});

// ─── Regression: unprefixed config and public store list still work ──────────

describe("Regression — public store config endpoint still works", () => {
  it("GET /api/stores returns created active store", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());

    const res = await request(app).get("/api/stores");
    expect(res.status).toBe(200);
    const keys = res.body.map((s: { storeKey: string }) => s.storeKey);
    expect(keys).toContain(TEST_STORE_KEY);
  });

  it("GET /api/stores/:storeKey/config returns store config for any store", async () => {
    await request(app).post("/api/admin/stores").set("Cookie", adminCookie).set("Content-Type", "application/json").send(baseStorePayload());

    const res = await request(app).get(`/api/stores/${TEST_STORE_KEY}/config`);
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
    expect(res.body.storeName).toBeTruthy();
  });
});
