import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db, pool } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  postersTable,
  posterSizesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  cleanupTestOrders,
  cleanupTestCart,
  getFirstPublishedPoster,
  getFirstActiveSizeForPoster,
  addCartItem,
  TEST_STORE_KEY,
} from "./setup";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "test-admin-token";
const TEST_EMAIL = "order-test-vitest@example.com";

const VALID_CHECKOUT = {
  storeKey: TEST_STORE_KEY,
  customerEmail: TEST_EMAIL,
  shippingName: "Test User",
  shippingAddressLine1: "123 Test Street",
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
  testSessionId = `test-session-${Date.now()}-${Math.random()}`;
  await cleanupTestOrders(TEST_EMAIL);
});

afterEach(async () => {
  await cleanupTestCart(testSessionId);
  await cleanupTestOrders(TEST_EMAIL);
});

// ─── Checkout: Cart Validation ────────────────────────────────────────────────

describe("POST /api/orders — cart validation", () => {
  it("rejects order when cart is empty", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cart is empty/i);
  });

  it("rejects order with invalid/missing required fields", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const res = await request(app)
      .post("/api/orders")
      .send({
        storeKey: TEST_STORE_KEY,
        sessionId: testSessionId,
        customerEmail: "not-an-email",
        shippingName: "Test",
        shippingAddressLine1: "123 St",
        shippingPostalCode: "28001",
        shippingCity: "Madrid",
        shippingCountry: "Spain",
      });

    expect(res.status).toBe(400);
  });

  it("rejects order when required shipping fields are missing", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const res = await request(app)
      .post("/api/orders")
      .send({
        storeKey: TEST_STORE_KEY,
        sessionId: testSessionId,
        customerEmail: TEST_EMAIL,
        shippingName: "Test",
        // Missing shippingAddressLine1, shippingPostalCode, shippingCity, shippingCountry
      });

    expect(res.status).toBe(400);
  });

  it("rejects order when cart item references an inactive size", async () => {
    if (!publishedPosterId) return;

    // Insert an inactive size
    const [inactiveSize] = await db
      .insert(posterSizesTable)
      .values({
        posterId: publishedPosterId,
        sizeLabel: "INACTIVE-TEST",
        price: "99.00",
        currency: "EUR",
        active: false,
        sortOrder: 999,
      })
      .returning();

    await addCartItem(testSessionId, publishedPosterId, inactiveSize.id);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(res.body.invalidItems).toBeDefined();
    expect(res.body.invalidItems.length).toBeGreaterThan(0);

    await db.delete(posterSizesTable).where(eq(posterSizesTable.id, inactiveSize.id));
  });
});

// ─── Checkout: Successful Order Creation ─────────────────────────────────────

describe("POST /api/orders — successful creation", () => {
  it("creates order draft with pending_payment status", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("pending_payment");
    expect(res.body.storeKey).toBe(TEST_STORE_KEY);
    expect(res.body.customerEmail).toBe(TEST_EMAIL);
  });

  it("calculates price server-side, ignores any frontend price", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    // Get expected price from DB
    const poster = await db.select().from(postersTable).where(eq(postersTable.id, publishedPosterId)).then(r => r[0]);
    const size = activeSizeId
      ? await db.select().from(posterSizesTable).where(eq(posterSizesTable.id, activeSizeId)).then(r => r[0])
      : undefined;
    const expectedUnitPrice = size ? Number(size.price) : Number(poster?.price);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(201);
    expect(res.body.items[0].unitPrice).toBe(expectedUnitPrice);
    expect(res.body.total).toBe(expectedUnitPrice * 1); // qty=1
  });

  it("clears cart after successful order creation", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    const cartItems = await db
      .select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.sessionId, testSessionId));

    expect(cartItems.length).toBe(0);
  });

  it("creates order_items with snapshot data", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const poster = await db.select().from(postersTable).where(eq(postersTable.id, publishedPosterId)).then(r => r[0]);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);

    const item = res.body.items[0];
    expect(item.posterTitleSnapshot).toBe(poster?.title);
    expect(item.orderId).toBe(res.body.id);
    expect(item.posterId).toBe(publishedPosterId);
    expect(item.unitPrice).toBeTypeOf("number");
    expect(item.totalPrice).toBeTypeOf("number");
    expect(item.currency).toBeDefined();
  });

  it("stores size snapshot when size is selected", async () => {
    if (!publishedPosterId || !activeSizeId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId);

    const size = await db.select().from(posterSizesTable).where(eq(posterSizesTable.id, activeSizeId)).then(r => r[0]);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(201);
    const item = res.body.items[0];
    expect(item.sizeLabelSnapshot).toBe(size?.sizeLabel);
    expect(item.unitPrice).toBe(Number(size?.price));
  });

  it("stores image snapshot in order_items", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(201);
    const item = res.body.items[0];
    // previewImageUrlSnapshot should be set (falls back to imageUrl)
    expect(item.previewImageUrlSnapshot).toBeTruthy();
  });

  it("accepts optional fields: notes and newsletter opt-in", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const res = await request(app)
      .post("/api/orders")
      .send({
        ...VALID_CHECKOUT,
        sessionId: testSessionId,
        customerNotes: "Please handle with care",
        newsletterOptIn: true,
        shippingAddressLine2: "Floor 3",
        shippingRegion: "Community of Madrid",
      });

    expect(res.status).toBe(201);
    expect(res.body.customerNotes).toBe("Please handle with care");
    expect(res.body.shippingAddressLine2).toBe("Floor 3");
    expect(res.body.shippingRegion).toBe("Community of Madrid");
  });
});

// ─── GET /api/orders/:id ─────────────────────────────────────────────────────

describe("GET /api/orders/:id", () => {
  it("returns order with items for valid id", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const createRes = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    const orderId = createRes.body.id;

    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("returns 404 for unknown order id", async () => {
    const res = await request(app).get("/api/orders/99999999");
    expect(res.status).toBe(404);
  });
});

// ─── Admin: Auth Protection ───────────────────────────────────────────────────

describe("Admin order routes: auth protection", () => {
  it("GET /admin/orders requires admin token", async () => {
    const res = await request(app).get("/api/admin/orders");
    expect(res.status).toBe(401);
  });

  it("GET /admin/orders/:id requires admin token", async () => {
    const res = await request(app).get("/api/admin/orders/1");
    expect(res.status).toBe(401);
  });

  it("PATCH /admin/orders/:id/status requires admin token", async () => {
    const res = await request(app)
      .patch("/api/admin/orders/1/status")
      .send({ status: "paid" });
    expect(res.status).toBe(401);
  });
});

// ─── Admin: Order List ────────────────────────────────────────────────────────

describe("GET /api/admin/orders", () => {
  it("returns paginated order list scoped to store", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);
    await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    const res = await request(app)
      .get(`/api/admin/orders?storeKey=${TEST_STORE_KEY}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders).toBeDefined();
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(res.body.orders.every((o: any) => o.storeKey === TEST_STORE_KEY)).toBe(true);
  });

  it("only returns orders for the requested store", async () => {
    const res = await request(app)
      .get("/api/admin/orders?storeKey=nonexistent-store-xyz")
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("can filter by status", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);
    await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    const res = await request(app)
      .get(`/api/admin/orders?storeKey=${TEST_STORE_KEY}&status=pending_payment`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.orders.every((o: any) => o.status === "pending_payment")).toBe(true);
  });
});

// ─── Admin: Order Detail ──────────────────────────────────────────────────────

describe("GET /api/admin/orders/:id", () => {
  it("returns full order detail with item snapshots", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const createRes = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    const orderId = createRes.body.id;

    const res = await request(app)
      .get(`/api/admin/orders/${orderId}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.customerEmail).toBe(TEST_EMAIL);
    expect(res.body.shippingName).toBe("Test User");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].posterTitleSnapshot).toBeTruthy();
    expect(res.body.items[0].unitPrice).toBeTypeOf("number");
    expect(res.body.items[0].totalPrice).toBeTypeOf("number");
  });

  it("returns 404 for unknown order", async () => {
    const res = await request(app)
      .get("/api/admin/orders/99999999")
      .set("X-Admin-Token", ADMIN_TOKEN);
    expect(res.status).toBe(404);
  });
});

// ─── Admin: Status Update ─────────────────────────────────────────────────────

describe("PATCH /api/admin/orders/:id/status", () => {
  it("updates order status successfully", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const createRes = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    const orderId = createRes.body.id;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ status: "paid" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");
    expect(res.body.id).toBe(orderId);
  });

  it("can set status to all valid values", async () => {
    if (!publishedPosterId) return;

    const statuses = ["draft", "pending_payment", "paid", "processing", "shipped", "cancelled"];

    for (const status of statuses) {
      const sessionId = `test-status-${Date.now()}-${Math.random()}`;
      await addCartItem(sessionId, publishedPosterId, activeSizeId ?? undefined);

      const createRes = await request(app)
        .post("/api/orders")
        .send({ ...VALID_CHECKOUT, sessionId });

      const orderId = createRes.body.id;

      const res = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set("X-Admin-Token", ADMIN_TOKEN)
        .send({ status });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);

      await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
      await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
    }
  });

  it("rejects invalid status values", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const createRes = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    const orderId = createRes.body.id;

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ status: "invalid-status" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown order", async () => {
    const res = await request(app)
      .patch("/api/admin/orders/99999999/status")
      .set("X-Admin-Token", ADMIN_TOKEN)
      .send({ status: "paid" });
    expect(res.status).toBe(404);
  });
});

// ─── Regression: Existing Endpoints ──────────────────────────────────────────

describe("Regression: existing endpoints still work", () => {
  it("GET /api/healthz returns ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /api/posters returns poster list", async () => {
    const res = await request(app).get(`/api/posters?storeKey=${TEST_STORE_KEY}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posters)).toBe(true);
  });

  it("GET /api/cart returns empty cart for new session", async () => {
    const res = await request(app).get(
      `/api/cart?sessionId=regression-test-cart-${Date.now()}&storeKey=${TEST_STORE_KEY}`
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("POST /api/cart/items adds item to cart", async () => {
    if (!publishedPosterId) return;
    const sessionId = `regression-cart-${Date.now()}`;

    const res = await request(app)
      .post("/api/cart/items")
      .send({
        sessionId,
        storeKey: TEST_STORE_KEY,
        posterId: publishedPosterId,
        quantity: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);

    await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));
  });

  it("GET /api/user/favorites returns list for authenticated user", async () => {
    // Favorites require a logged-in user (storeKey-scoped); register a temp user to get the session cookie
    const favEmail = `fav-regression-${Date.now()}@example.com`;
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: favEmail, password: "test-password-123" });
    expect(registerRes.status).toBe(201);

    const cookie = registerRes.headers["set-cookie"] as string | string[];

    const res = await request(app)
      .get(`/api/user/favorites?storeKey=${TEST_STORE_KEY}`)
      .set("Cookie", Array.isArray(cookie) ? cookie.join("; ") : cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Clean up temp user and their session
    await pool.query(
      "DELETE FROM user_sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [favEmail]
    );
    await pool.query("DELETE FROM users WHERE email = $1", [favEmail]);
  });

  it("Admin poster CRUD still works (list)", async () => {
    const res = await request(app)
      .get(`/api/posters?storeKey=${TEST_STORE_KEY}&status=all`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posters)).toBe(true);
  });
});
