import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  cleanupTestOrders,
  cleanupTestCart,
  getFirstPublishedPoster,
  getFirstActiveSizeForPoster,
  addCartItem,
  TEST_STORE_KEY,
} from "./setup";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "test-admin-token";
const TEST_EMAIL = "fulfillment-vitest@example.com";

const VALID_CHECKOUT = {
  storeKey: TEST_STORE_KEY,
  customerEmail: TEST_EMAIL,
  shippingName: "Fulfillment Test User",
  shippingAddressLine1: "99 Fulfillment Street",
  shippingPostalCode: "28001",
  shippingCity: "Madrid",
  shippingCountry: "Spain",
};

let testSessionId: string;
let publishedPosterId: number | null = null;
let activeSizeId: number | null = null;

beforeAll(async () => {
  const poster = await getFirstPublishedPoster();
  if (poster) {
    publishedPosterId = poster.id;
    const size = await getFirstActiveSizeForPoster(poster.id);
    if (size) activeSizeId = size.id;
  }
});

beforeEach(async () => {
  testSessionId = `fulfillment-test-session-${Date.now()}-${Math.random()}`;
  await cleanupTestOrders(TEST_EMAIL);
});

afterEach(async () => {
  await cleanupTestCart(testSessionId);
  await cleanupTestOrders(TEST_EMAIL);
});

async function createPaidOrder(): Promise<number | null> {
  if (!publishedPosterId) return null;
  await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);
  const createRes = await request(app)
    .post("/api/orders")
    .send({ ...VALID_CHECKOUT, sessionId: testSessionId });
  if (createRes.status !== 201) return null;
  const orderId = createRes.body.id;
  await db
    .update(ordersTable)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(ordersTable.id, orderId));
  return orderId;
}

// ─── Auth Protection ──────────────────────────────────────────────────────────

describe("Fulfillment routes: auth protection", () => {
  it("GET /admin/fulfillment requires admin token", async () => {
    const res = await request(app).get("/api/admin/fulfillment");
    expect(res.status).toBe(401);
  });

  it("GET /admin/fulfillment/export.csv requires admin token", async () => {
    const res = await request(app).get("/api/admin/fulfillment/export.csv");
    expect(res.status).toBe(401);
  });

  it("PATCH /admin/orders/:id/fulfillment requires admin token", async () => {
    const res = await request(app)
      .patch("/api/admin/orders/1/fulfillment")
      .send({ fulfillmentStatus: "ready_for_production" });
    expect(res.status).toBe(401);
  });
});

// ─── Fulfillment List ─────────────────────────────────────────────────────────

describe("GET /api/admin/fulfillment", () => {
  it("returns paid, non-shipped orders by default", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .get(`/api/admin/fulfillment?storeKey=${TEST_STORE_KEY}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders).toBeDefined();
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.orders.some((o: any) => o.id === orderId)).toBe(true);
  });

  it("is scoped to requested store only", async () => {
    const res = await request(app)
      .get("/api/admin/fulfillment?storeKey=nonexistent-store-xyz")
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("does not include pending_payment orders by default", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);
    const createRes = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;

    const res = await request(app)
      .get(`/api/admin/fulfillment?storeKey=${TEST_STORE_KEY}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders.some((o: any) => o.id === orderId)).toBe(false);
  });

  it("can filter by fulfillment status", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    await db
      .update(ordersTable)
      .set({ fulfillmentStatus: "ready_for_production" })
      .where(eq(ordersTable.id, orderId));

    const res = await request(app)
      .get(`/api/admin/fulfillment?storeKey=${TEST_STORE_KEY}&fulfillmentStatus=ready_for_production`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders.some((o: any) => o.id === orderId)).toBe(true);
    expect(res.body.orders.every((o: any) => o.fulfillmentStatus === "ready_for_production")).toBe(true);
  });

  it("does not include shipped orders in the default queue", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    await db
      .update(ordersTable)
      .set({ fulfillmentStatus: "shipped", shippedAt: new Date() })
      .where(eq(ordersTable.id, orderId));

    const res = await request(app)
      .get(`/api/admin/fulfillment?storeKey=${TEST_STORE_KEY}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders.some((o: any) => o.id === orderId)).toBe(false);
  });

  it("can explicitly filter to include shipped orders", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    await db
      .update(ordersTable)
      .set({ fulfillmentStatus: "shipped", shippedAt: new Date(), status: "shipped" })
      .where(eq(ordersTable.id, orderId));

    const res = await request(app)
      .get(`/api/admin/fulfillment?storeKey=${TEST_STORE_KEY}&fulfillmentStatus=shipped&orderStatus=shipped`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders.some((o: any) => o.id === orderId)).toBe(true);
  });
});

// ─── Fulfillment Update ────────────────────────────────────────────────────────

describe("PATCH /api/admin/orders/:id/fulfillment", () => {
  it("can update fulfillment status", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ fulfillmentStatus: "ready_for_production" });

    expect(res.status).toBe(200);
    expect(res.body.fulfillmentStatus).toBe("ready_for_production");
  });

  it("can save tracking number and URL", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({
        trackingNumber: "1Z999AA10123456784",
        trackingUrl: "https://track.example.com/1Z999AA10123456784",
      });

    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe("1Z999AA10123456784");
    expect(res.body.trackingUrl).toBe("https://track.example.com/1Z999AA10123456784");
  });

  it("can save fulfillment notes", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ fulfillmentNotes: "Print at 300dpi, matte finish" });

    expect(res.status).toBe(200);
    expect(res.body.fulfillmentNotes).toBe("Print at 300dpi, matte finish");
  });

  it("markShipped sets shippedAt and fulfillmentStatus to shipped", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ markShipped: true });

    expect(res.status).toBe(200);
    expect(res.body.fulfillmentStatus).toBe("shipped");
    expect(res.body.shippedAt).toBeTruthy();
    expect(res.body.status).toBe("shipped");
  });

  it("markShipped can also set tracking info", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({
        markShipped: true,
        trackingNumber: "TRACK123",
        trackingUrl: "https://track.example.com/TRACK123",
      });

    expect(res.status).toBe(200);
    expect(res.body.fulfillmentStatus).toBe("shipped");
    expect(res.body.shippedAt).toBeTruthy();
    expect(res.body.trackingNumber).toBe("TRACK123");
  });

  it("markInProduction sets productionStartedAt and fulfillmentStatus", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ markInProduction: true });

    expect(res.status).toBe(200);
    expect(res.body.fulfillmentStatus).toBe("in_production");
    expect(res.body.productionStartedAt).toBeTruthy();
  });

  it("returns 404 for unknown order", async () => {
    const res = await request(app)
      .patch("/api/admin/orders/99999999/fulfillment")
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ fulfillmentStatus: "ready_for_production" });
    expect(res.status).toBe(404);
  });

  it("rejects invalid fulfillment status", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ fulfillmentStatus: "invalid-status" });

    expect(res.status).toBe(400);
  });
});

// ─── Order Detail: Print File Access ──────────────────────────────────────────

describe("GET /api/admin/orders/:id — print file snapshot", () => {
  it("returns masterPrintImageUrlSnapshot when present", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const items = await db
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, orderId));

    const res = await request(app)
      .get(`/api/admin/orders/${orderId}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);

    for (const item of res.body.items) {
      expect("masterPrintImageUrlSnapshot" in item).toBe(true);
      expect("previewImageUrlSnapshot" in item).toBe(true);
    }
  });

  it("shippedAt and productionStartedAt are returned in order detail", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ markInProduction: true });

    await request(app)
      .patch(`/api/admin/orders/${orderId}/fulfillment`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ markShipped: true });

    const res = await request(app)
      .get(`/api/admin/orders/${orderId}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.productionStartedAt).toBeTruthy();
    expect(res.body.shippedAt).toBeTruthy();
  });
});

// ─── CSV Export ────────────────────────────────────────────────────────────────

describe("GET /api/admin/fulfillment/export.csv", () => {
  it("requires admin token", async () => {
    const res = await request(app).get("/api/admin/fulfillment/export.csv");
    expect(res.status).toBe(401);
  });

  it("returns CSV content type", async () => {
    const res = await request(app)
      .get(`/api/admin/fulfillment/export.csv?storeKey=${TEST_STORE_KEY}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
  });

  it("returns CSV with human-readable headers", async () => {
    const res = await request(app)
      .get(`/api/admin/fulfillment/export.csv?storeKey=${TEST_STORE_KEY}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    const firstLine = res.text.replace(/^\uFEFF/, "").split("\r\n")[0];
    expect(firstLine).toContain("Order ID");
    expect(firstLine).toContain("Customer Email");
    expect(firstLine).toContain("Shipping Name");
    expect(firstLine).toContain("Poster Title");
    expect(firstLine).toContain("Master Print File URL");
    expect(firstLine).toContain("Tracking Number");
    expect(firstLine).toContain("Fulfillment Status");
    expect(firstLine).toContain("Order Date");
    expect(firstLine).toContain("Order Total");
    expect(firstLine).toContain("Currency");
  });

  it("is store-scoped (nonexistent store returns only header row)", async () => {
    const res = await request(app)
      .get("/api/admin/fulfillment/export.csv?storeKey=nonexistent-store-xyz")
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines.length).toBe(1);
  });

  it("includes item snapshot data in rows", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .get(`/api/admin/fulfillment/export.csv?storeKey=${TEST_STORE_KEY}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.text).toContain(String(orderId));
    expect(res.text).toContain(TEST_EMAIL);
  });
});

// ─── Regression ───────────────────────────────────────────────────────────────

describe("Regression: fulfillment additions do not break existing flows", () => {
  it("POST /api/orders still creates orders", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("pending_payment");
    expect(res.body.fulfillmentStatus).toBeDefined();
  });

  it("GET /api/admin/orders still works with fulfillmentStatus field", async () => {
    const res = await request(app)
      .get(`/api/admin/orders?storeKey=${TEST_STORE_KEY}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
    if (res.body.orders.length > 0) {
      expect("fulfillmentStatus" in res.body.orders[0]).toBe(true);
    }
  });

  it("GET /api/admin/orders can filter by fulfillmentStatus", async () => {
    const res = await request(app)
      .get(`/api/admin/orders?storeKey=${TEST_STORE_KEY}&fulfillmentStatus=not_started`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  it("PATCH /admin/orders/:id/status still works", async () => {
    const orderId = await createPaidOrder();
    if (!orderId) return;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ status: "processing" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("processing");
  });

  it("GET /api/healthz still works", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
