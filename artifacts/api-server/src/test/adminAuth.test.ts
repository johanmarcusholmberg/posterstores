import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

const VALID_TOKEN = process.env.ADMIN_API_TOKEN ?? "test-admin-token";

describe("POST /api/admin/login", () => {
  it("returns 401 for wrong token", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ token: "wrong-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it("returns 200 and sets admin_session cookie for correct token", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ token: VALID_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const cookies: string[] = res.headers["set-cookie"] as unknown as string[];
    expect(Array.isArray(cookies)).toBe(true);
    const sessionCookie = cookies.find((c: string) => c.startsWith("admin_session="));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie).toMatch(/HttpOnly/i);
  });

  it("returns 401 for missing token body", async () => {
    const res = await request(app).post("/api/admin/login").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/session", () => {
  it("returns 401 without cookie", async () => {
    const res = await request(app).get("/api/admin/session");
    expect(res.status).toBe(401);
    expect(res.body.authenticated).toBe(false);
  });

  it("returns 200 with valid session cookie", async () => {
    const loginRes = await request(app)
      .post("/api/admin/login")
      .send({ token: VALID_TOKEN });
    expect(loginRes.status).toBe(200);

    const cookies: string[] = loginRes.headers["set-cookie"] as unknown as string[];
    const cookieHeader = cookies.map((c: string) => c.split(";")[0]).join("; ");

    const sessionRes = await request(app)
      .get("/api/admin/session")
      .set("Cookie", cookieHeader);
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.authenticated).toBe(true);
  });

  it("returns 401 with a fabricated session cookie", async () => {
    const res = await request(app)
      .get("/api/admin/session")
      .set("Cookie", "admin_session=00000000-fake-uuid-0000-000000000000");
    expect(res.status).toBe(401);
    expect(res.body.authenticated).toBe(false);
  });
});

describe("Admin routes — legacy X-Admin-Token header is rejected", () => {
  it("returns 401 when X-Admin-Token header is sent without cookie", async () => {
    const res = await request(app)
      .get("/api/admin/stores")
      .set("X-Admin-Token", VALID_TOKEN);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/logout", () => {
  it("clears the session and subsequent /session returns 401", async () => {
    const loginRes = await request(app)
      .post("/api/admin/login")
      .send({ token: VALID_TOKEN });
    expect(loginRes.status).toBe(200);

    const cookies: string[] = loginRes.headers["set-cookie"] as unknown as string[];
    const cookieHeader = cookies.map((c: string) => c.split(";")[0]).join("; ");

    const logoutRes = await request(app)
      .post("/api/admin/logout")
      .set("Cookie", cookieHeader);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.ok).toBe(true);

    const sessionRes = await request(app)
      .get("/api/admin/session")
      .set("Cookie", cookieHeader);
    expect(sessionRes.status).toBe(401);
    expect(sessionRes.body.authenticated).toBe(false);
  });

  it("returns 200 even without a cookie (idempotent logout)", async () => {
    const res = await request(app).post("/api/admin/logout");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("GET /api/posters — status=all auth enforcement", () => {
  it("returns 401 when requesting status=all without admin cookie", async () => {
    const res = await request(app).get("/api/posters?storeKey=postsofspain&status=all");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it("returns 401 when requesting status=draft without admin cookie", async () => {
    const res = await request(app).get("/api/posters?storeKey=postsofspain&status=draft");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it("returns 200 with all statuses when valid admin cookie is present", async () => {
    const loginRes = await request(app)
      .post("/api/admin/login")
      .send({ token: VALID_TOKEN });
    expect(loginRes.status).toBe(200);

    const cookies: string[] = loginRes.headers["set-cookie"] as unknown as string[];
    const cookieHeader = cookies.map((c: string) => c.split(";")[0]).join("; ");

    const res = await request(app)
      .get("/api/posters?storeKey=postsofspain&status=all")
      .set("Cookie", cookieHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posters)).toBe(true);
  });

  it("returns 200 for status=published without admin cookie (public route)", async () => {
    const res = await request(app).get("/api/posters?storeKey=postsofspain&status=published");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posters)).toBe(true);
  });
});
