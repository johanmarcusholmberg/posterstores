import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import { storesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { seedPostsofSpain } from "../lib/seedPostsofSpain";
import { getAdminCookie } from "./setup";

let adminCookie = "";
beforeAll(async () => { adminCookie = await getAdminCookie(); });

// ── Task 1: PostsofSpain DB seeding ───────────────────────────────────────────

describe("seedPostsofSpain — store record creation", () => {
  it("creates postsofspain store if not in DB, and returns it on /api/stores/postsofspain/config", async () => {
    await seedPostsofSpain();

    const res = await request(app).get("/api/stores/postsofspain/config");
    expect(res.status).toBe(200);
    expect(res.body.storeKey).toBe("postsofspain");
    expect(res.body.storeName).toBeTruthy();
    expect(res.body.defaultCurrency).toBe("EUR");
    expect(res.body.countryFocus).toBe("Spain");
    expect(res.body.homepage).toBeTruthy();
    expect(typeof res.body.homepage.heroTitle).toBe("string");
    expect(res.body.homepage.heroTitle.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.regions)).toBe(true);
    expect(res.body.regions.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.cities)).toBe(true);
    expect(res.body.cities.length).toBeGreaterThan(0);
    expect(res.body.seo).toBeTruthy();
    expect(res.body.theme).toBeTruthy();
  });

  it("does not overwrite existing DB store config on repeated seed", async () => {
    await seedPostsofSpain();

    const [before] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.storeKey, "postsofspain"))
      .limit(1);

    const updatedAt = before?.updatedAt;

    await seedPostsofSpain();

    const [after] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.storeKey, "postsofspain"))
      .limit(1);

    expect(after?.updatedAt.toISOString()).toBe(updatedAt?.toISOString());
  });

  it("postsofspain appears in /api/stores public list after seed", async () => {
    await seedPostsofSpain();

    const res = await request(app).get("/api/stores");
    expect(res.status).toBe(200);
    const keys = res.body.map((s: { storeKey: string }) => s.storeKey);
    expect(keys).toContain("postsofspain");
  });
});

// ── Task 2: Launch checklist — EMAIL_PROVIDER warnings ───────────────────────

describe("/api/admin/launch-checklist — email provider warnings", () => {
  beforeAll(async () => {
    await seedPostsofSpain();
  });

  it("shows missing status for email-provider when EMAIL_PROVIDER is not set", async () => {
    const savedProvider = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;

    const res = await request(app)
      .get("/api/admin/launch-checklist?storeKey=postsofspain")
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    process.env.EMAIL_PROVIDER = savedProvider;

    expect(res.status).toBe(200);
    const emailSection = res.body.sections.find(
      (s: { id: string }) => s.id === "email"
    );
    expect(emailSection).toBeTruthy();

    const providerItem = emailSection.items.find(
      (i: { id: string }) => i.id === "email-provider"
    );
    expect(providerItem).toBeTruthy();
    expect(providerItem.status).toBe("missing");
    expect(providerItem.detail).toContain("EMAIL_PROVIDER");
  });

  it("shows missing for resend-api-key when EMAIL_PROVIDER=resend but RESEND_API_KEY absent", async () => {
    const savedProvider = process.env.EMAIL_PROVIDER;
    const savedKey = process.env.RESEND_API_KEY;

    process.env.EMAIL_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;

    const res = await request(app)
      .get("/api/admin/launch-checklist?storeKey=postsofspain")
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    process.env.EMAIL_PROVIDER = savedProvider;
    if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey;

    expect(res.status).toBe(200);
    const emailSection = res.body.sections.find(
      (s: { id: string }) => s.id === "email"
    );
    const resendItem = emailSection.items.find(
      (i: { id: string }) => i.id === "resend-api-key"
    );
    expect(resendItem).toBeTruthy();
    expect(resendItem.status).toBe("missing");
    expect(resendItem.detail).toContain("RESEND_API_KEY");
  });

  it("shows warning for resend-api-key when RESEND_API_KEY set but EMAIL_PROVIDER is not resend", async () => {
    const savedProvider = process.env.EMAIL_PROVIDER;
    const savedKey = process.env.RESEND_API_KEY;

    delete process.env.EMAIL_PROVIDER;
    process.env.RESEND_API_KEY = "re_test_key";

    const res = await request(app)
      .get("/api/admin/launch-checklist?storeKey=postsofspain")
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    if (savedProvider !== undefined) process.env.EMAIL_PROVIDER = savedProvider;
    else delete process.env.EMAIL_PROVIDER;
    if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey;
    else delete process.env.RESEND_API_KEY;

    expect(res.status).toBe(200);
    const emailSection = res.body.sections.find(
      (s: { id: string }) => s.id === "email"
    );
    const resendItem = emailSection.items.find(
      (i: { id: string }) => i.id === "resend-api-key"
    );
    expect(resendItem).toBeTruthy();
    expect(resendItem.status).toBe("warning");
  });

  it("shows missing for ADMIN_ORDER_NOTIFICATION_EMAIL when not set", async () => {
    const saved = process.env.ADMIN_ORDER_NOTIFICATION_EMAIL;
    delete process.env.ADMIN_ORDER_NOTIFICATION_EMAIL;

    const res = await request(app)
      .get("/api/admin/launch-checklist?storeKey=postsofspain")
      .set("Cookie", adminCookie).set("Content-Type", "application/json");

    if (saved !== undefined) process.env.ADMIN_ORDER_NOTIFICATION_EMAIL = saved;

    expect(res.status).toBe(200);
    const emailSection = res.body.sections.find(
      (s: { id: string }) => s.id === "email"
    );
    const adminEmailItem = emailSection.items.find(
      (i: { id: string }) => i.id === "admin-notification-email"
    );
    expect(adminEmailItem).toBeTruthy();
    expect(adminEmailItem.status).toBe("missing");
  });
});

// ── Task 3: /api/health endpoint ─────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns timestamp as ISO string", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(typeof res.body.timestamp).toBe("string");
    expect(() => new Date(res.body.timestamp)).not.toThrow();
  });

  it("returns service name", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(typeof res.body.service).toBe("string");
    expect(res.body.service.length).toBeGreaterThan(0);
  });

  it("returns database status object", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.database).toBeTruthy();
    expect(res.body.database.status).toBe("ok");
  });
});

describe("GET /api/healthz — still works", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ── Task 4: Newsletter subscribe alias ────────────────────────────────────────

describe("POST /api/newsletter — original endpoint", () => {
  it("subscribes successfully", async () => {
    const res = await request(app)
      .post("/api/newsletter")
      .send({ email: "newsletter-test-vitest@example.com", storeKey: "postsofspain" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 when email field is missing", async () => {
    const res = await request(app)
      .post("/api/newsletter")
      .send({ storeKey: "postsofspain" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/newsletter/subscribe — alias endpoint", () => {
  it("subscribes successfully via alias", async () => {
    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email: "newsletter-alias-vitest@example.com", storeKey: "postsofspain" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 for missing email via alias", async () => {
    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ storeKey: "postsofspain" });
    expect(res.status).toBe(400);
  });

  it("handles duplicate subscription gracefully via alias", async () => {
    const email = "newsletter-dup-vitest@example.com";
    await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email, storeKey: "postsofspain" });

    const res = await request(app)
      .post("/api/newsletter/subscribe")
      .send({ email, storeKey: "postsofspain" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
