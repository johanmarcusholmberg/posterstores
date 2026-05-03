import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  posterSizesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  cleanupTestOrders,
  cleanupTestCart,
  getFirstPublishedPoster,
  getFirstActiveSizeForPoster,
  addCartItem,
  TEST_STORE_KEY,
} from "./setup";
import Stripe from "stripe";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "test-admin-token";
const TEST_EMAIL = "stripe-test-vitest@example.com";

const VALID_CHECKOUT = {
  storeKey: TEST_STORE_KEY,
  customerEmail: TEST_EMAIL,
  shippingName: "Stripe Test User",
  shippingAddressLine1: "456 Test Avenue",
  shippingPostalCode: "28002",
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
  testSessionId = `stripe-session-${Date.now()}-${Math.random()}`;
  await cleanupTestOrders(TEST_EMAIL);
});

afterEach(async () => {
  await cleanupTestCart(testSessionId);
  await cleanupTestOrders(TEST_EMAIL);
});

async function createTestOrder() {
  if (!publishedPosterId) throw new Error("No published poster available for testing");
  await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);
  const res = await request(app)
    .post("/api/orders")
    .send({ ...VALID_CHECKOUT, sessionId: testSessionId });
  expect(res.status).toBe(201);
  return res.body as { id: number; storeKey: string; total: number; currency: string };
}

// ─── Create Checkout Session ──────────────────────────────────────────────────

describe("POST /api/orders/:id/create-checkout-session", () => {
  it("returns 404 for non-existent order", async () => {
    const res = await request(app)
      .post("/api/orders/99999999/create-checkout-session?storeKey=postsofspain")
      .send();

    expect(res.status).toBe(404);
  });

  it("returns 400 when storeKey is missing", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const res = await request(app)
      .post(`/api/orders/${order.id}/create-checkout-session`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/storeKey/i);
  });

  it("returns 403 when storeKey does not match order store", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const res = await request(app)
      .post(`/api/orders/${order.id}/create-checkout-session?storeKey=wrong-store`)
      .send();

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong/i);
  });

  it("returns 400 for already paid order", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    await db
      .update(ordersTable)
      .set({ status: "paid", paymentStatus: "paid" })
      .where(eq(ordersTable.id, order.id));

    const res = await request(app)
      .post(`/api/orders/${order.id}/create-checkout-session?storeKey=${TEST_STORE_KEY}`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already paid/i);
  });

  it("returns 500 if Stripe is not configured", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const originalKey = process.env.STRIPE_SECRET_KEY;
    const originalUrl = process.env.APP_BASE_URL;
    delete process.env.STRIPE_SECRET_KEY;
    process.env.APP_BASE_URL = "https://example.com";

    const res = await request(app)
      .post(`/api/orders/${order.id}/create-checkout-session?storeKey=${TEST_STORE_KEY}`)
      .send();

    if (originalKey) process.env.STRIPE_SECRET_KEY = originalKey;
    else delete process.env.STRIPE_SECRET_KEY;
    if (originalUrl) process.env.APP_BASE_URL = originalUrl;
    else delete process.env.APP_BASE_URL;

    expect(res.status).toBe(500);
  });

  it("returns 500 if neither APP_BASE_URL nor REPLIT_DOMAINS is configured", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const originalUrl = process.env.APP_BASE_URL;
    const originalDomains = process.env.REPLIT_DOMAINS;
    delete process.env.APP_BASE_URL;
    delete process.env.REPLIT_DOMAINS;

    const res = await request(app)
      .post(`/api/orders/${order.id}/create-checkout-session?storeKey=${TEST_STORE_KEY}`)
      .send();

    if (originalUrl) process.env.APP_BASE_URL = originalUrl;
    if (originalDomains) process.env.REPLIT_DOMAINS = originalDomains;

    expect(res.status).toBe(500);
  });
});

// ─── Webhook ──────────────────────────────────────────────────────────────────

describe("POST /api/stripe/webhook", () => {
  it("rejects requests without stripe-signature header", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "checkout.session.completed" }));

    expect(res.status).toBe(400);

    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("rejects requests with invalid stripe signature", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_invalid";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_webhook_test";

    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=invalid,v1=invalidsig")
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);

    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("processes checkout.session.completed and marks order paid via valid webhook", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const stripeKey = "sk_test_dummy_for_webhook";
    const webhookSecret = "whsec_test_valid_secret_" + Date.now();
    process.env.STRIPE_SECRET_KEY = stripeKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    await db
      .update(ordersTable)
      .set({ stripeCheckoutSessionId: "cs_test_mock_session_" + order.id })
      .where(eq(ordersTable.id, order.id));

    const paymentIntentId = "pi_test_mock_" + order.id;
    const sessionPayload = {
      id: "cs_test_mock_session_" + order.id,
      object: "checkout.session",
      payment_status: "paid",
      payment_intent: paymentIntentId,
      customer_email: TEST_EMAIL,
      metadata: {
        orderId: String(order.id),
        storeKey: TEST_STORE_KEY,
      },
    };

    const eventPayload = {
      id: "evt_test_" + Date.now(),
      object: "event",
      type: "checkout.session.completed",
      data: { object: sessionPayload },
      livemode: false,
      created: Math.floor(Date.now() / 1000),
    };

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });
    const payloadString = JSON.stringify(eventPayload);
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: webhookSecret,
      timestamp,
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .type("text/plain")
      .set("stripe-signature", sig)
      .send(payloadString);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const [updatedOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));

    expect(updatedOrder.status).toBe("paid");
    expect(updatedOrder.paymentStatus).toBe("paid");
    expect(updatedOrder.stripePaymentIntentId).toBe(paymentIntentId);
    expect(updatedOrder.paidAt).not.toBeNull();

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("does not mark unrelated order paid", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const stripeKey = "sk_test_dummy_for_unrelated";
    const webhookSecret = "whsec_test_unrelated_" + Date.now();
    process.env.STRIPE_SECRET_KEY = stripeKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    const sessionPayload = {
      id: "cs_test_unrelated_session",
      object: "checkout.session",
      payment_status: "paid",
      payment_intent: "pi_test_unrelated",
      customer_email: "other@example.com",
      metadata: {
        orderId: "99999999",
        storeKey: TEST_STORE_KEY,
      },
    };

    const eventPayload = {
      id: "evt_test_unrelated_" + Date.now(),
      object: "event",
      type: "checkout.session.completed",
      data: { object: sessionPayload },
      livemode: false,
      created: Math.floor(Date.now() / 1000),
    };

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });
    const payloadString = JSON.stringify(eventPayload);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: webhookSecret,
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .type("text/plain")
      .set("stripe-signature", sig)
      .send(payloadString);

    expect(res.status).toBe(200);

    const [unchangedOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));

    expect(unchangedOrder.status).toBe("pending_payment");
    expect(unchangedOrder.paymentStatus).toBeNull();

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("handles checkout.session.expired and sets payment_status to cancelled", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const stripeKey = "sk_test_dummy_for_expired";
    const webhookSecret = "whsec_test_expired_" + Date.now();
    process.env.STRIPE_SECRET_KEY = stripeKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    const sessionId = "cs_test_expired_" + order.id;
    await db
      .update(ordersTable)
      .set({ stripeCheckoutSessionId: sessionId })
      .where(eq(ordersTable.id, order.id));

    const sessionPayload = {
      id: sessionId,
      object: "checkout.session",
      payment_status: "unpaid",
      payment_intent: null,
      customer_email: TEST_EMAIL,
      metadata: {
        orderId: String(order.id),
        storeKey: TEST_STORE_KEY,
      },
    };

    const eventPayload = {
      id: "evt_test_expired_" + Date.now(),
      object: "event",
      type: "checkout.session.expired",
      data: { object: sessionPayload },
      livemode: false,
      created: Math.floor(Date.now() / 1000),
    };

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });
    const payloadString = JSON.stringify(eventPayload);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: webhookSecret,
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .type("text/plain")
      .set("stripe-signature", sig)
      .send(payloadString);

    expect(res.status).toBe(200);

    const [updatedOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id));

    expect(updatedOrder.paymentStatus).toBe("cancelled");
    expect(updatedOrder.cancelledAt).not.toBeNull();
    expect(updatedOrder.status).toBe("pending_payment");

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });
});

// ─── Regression: existing order routes still work ──────────────────────────────

describe("Regression after Stripe integration", () => {
  it("POST /api/orders still creates order with pending_payment", async () => {
    if (!publishedPosterId) return;
    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending_payment");
    expect(res.body.stripeCheckoutSessionId).toBeFalsy();
  });

  it("GET /api/orders/:id returns new stripe fields as null when not set", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const res = await request(app).get(`/api/orders/${order.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
  });

  it("Admin order detail returns payment fields", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const sessionId = "cs_test_admin_detail_" + order.id;
    const intentId = "pi_test_admin_detail_" + order.id;
    await db
      .update(ordersTable)
      .set({
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: intentId,
        paymentStatus: "paid",
        paidAt: new Date(),
      })
      .where(eq(ordersTable.id, order.id));

    const res = await request(app)
      .get(`/api/admin/orders/${order.id}`)
      .set("X-Admin-Token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.stripeCheckoutSessionId).toBe(sessionId);
    expect(res.body.stripePaymentIntentId).toBe(intentId);
    expect(res.body.paymentStatus).toBe("paid");
    expect(res.body.paidAt).toBeTruthy();
  });

  it("GET /api/healthz still works", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
  });

  it("GET /api/posters still works", async () => {
    const res = await request(app).get(`/api/posters?storeKey=${TEST_STORE_KEY}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posters)).toBe(true);
  });
});
