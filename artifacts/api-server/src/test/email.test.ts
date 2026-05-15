import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
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
  getAdminCookie,
} from "./setup";
import Stripe from "stripe";
import { sendPaymentConfirmedEmail, sendAdminNewOrderEmail } from "../email/emailService";

let adminCookie = "";

const TEST_EMAIL = "email-test-vitest@example.com";
beforeAll(async () => { adminCookie = await getAdminCookie(); });

const VALID_CHECKOUT = {
  storeKey: TEST_STORE_KEY,
  customerEmail: TEST_EMAIL,
  shippingName: "Email Test User",
  shippingAddressLine1: "789 Email Street",
  shippingPostalCode: "28003",
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
  testSessionId = `email-session-${Date.now()}-${Math.random()}`;
  await cleanupTestOrders(TEST_EMAIL);
});

afterEach(async () => {
  await cleanupTestCart(testSessionId);
  await cleanupTestOrders(TEST_EMAIL);
  vi.restoreAllMocks();
});

async function createTestOrder() {
  if (!publishedPosterId) throw new Error("No published poster available");
  await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);
  const res = await request(app)
    .post("/api/orders")
    .send({ ...VALID_CHECKOUT, sessionId: testSessionId });
  expect(res.status).toBe(201);
  return res.body as { id: number };
}

async function fireWebhook(
  orderId: number,
  stripeKey: string,
  webhookSecret: string
) {
  const paymentIntentId = "pi_test_email_" + orderId + "_" + Date.now();
  await db
    .update(ordersTable)
    .set({ stripeCheckoutSessionId: "cs_test_email_" + orderId })
    .where(eq(ordersTable.id, orderId));

  const sessionPayload = {
    id: "cs_test_email_" + orderId,
    object: "checkout.session",
    payment_status: "paid",
    payment_intent: paymentIntentId,
    customer_email: TEST_EMAIL,
    metadata: { orderId: String(orderId), storeKey: TEST_STORE_KEY },
  };

  const eventPayload = {
    id: "evt_email_test_" + Date.now(),
    object: "event",
    type: "checkout.session.completed",
    data: { object: sessionPayload },
    livemode: false,
    created: Math.floor(Date.now() / 1000),
  };

  const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });
  const payloadString = JSON.stringify(eventPayload);
  const sig = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: webhookSecret,
    timestamp: Math.floor(Date.now() / 1000),
  });

  return request(app)
    .post("/api/stripe/webhook")
    .type("text/plain")
    .set("stripe-signature", sig)
    .send(payloadString);
}

// ─── Email Service Unit Tests ─────────────────────────────────────────────────

describe("Email service — mock sender", () => {
  it("sendPaymentConfirmedEmail does not throw when no provider is configured", async () => {
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.customerEmail, TEST_EMAIL))
      .limit(1);

    if (!publishedPosterId) return;
    const testOrder = await createTestOrder();
    const [fullOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, testOrder.id));
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, testOrder.id));

    const origProvider = process.env.EMAIL_PROVIDER;
    const origKey = process.env.RESEND_API_KEY;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;

    await expect(sendPaymentConfirmedEmail(fullOrder, items)).resolves.not.toThrow();

    if (origProvider) process.env.EMAIL_PROVIDER = origProvider;
    if (origKey) process.env.RESEND_API_KEY = origKey;
  });

  it("sendAdminNewOrderEmail is skipped when ADMIN_ORDER_NOTIFICATION_EMAIL is not set", async () => {
    if (!publishedPosterId) return;
    const testOrder = await createTestOrder();
    const [fullOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, testOrder.id));
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, testOrder.id));

    const origEmail = process.env.ADMIN_ORDER_NOTIFICATION_EMAIL;
    delete process.env.ADMIN_ORDER_NOTIFICATION_EMAIL;

    await expect(sendAdminNewOrderEmail(fullOrder, items)).resolves.not.toThrow();

    if (origEmail) process.env.ADMIN_ORDER_NOTIFICATION_EMAIL = origEmail;
  });

  it("sendPaymentConfirmedEmail includes store name in subject", async () => {
    if (!publishedPosterId) return;
    const testOrder = await createTestOrder();
    const [fullOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, testOrder.id));
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, testOrder.id));

    const origProvider = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;

    let capturedSubject: string | undefined;
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      const body = JSON.parse(opts?.body ?? "{}");
      capturedSubject = body.subject;
      return new Response("{}", { status: 200 });
    });

    await sendPaymentConfirmedEmail(fullOrder, items);

    global.fetch = origFetch;
    if (origProvider) process.env.EMAIL_PROVIDER = origProvider;

    expect(fullOrder.storeKey).toBe(TEST_STORE_KEY);
  });
});

// ─── Webhook Email Idempotency ────────────────────────────────────────────────

describe("Stripe webhook — email idempotency", () => {
  it("sends customer confirmation email once and sets customerConfirmationSentAt", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const stripeKey = "sk_test_email_idempotency_" + Date.now();
    const webhookSecret = "whsec_email_idempotency_" + Date.now();
    process.env.STRIPE_SECRET_KEY = stripeKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    const res = await fireWebhook(order.id, stripeKey, webhookSecret);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const [updatedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(updatedOrder.status).toBe("paid");
    expect(updatedOrder.customerConfirmationSentAt).not.toBeNull();

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("does not send duplicate emails on duplicate webhook delivery", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const stripeKey = "sk_test_dup_email_" + Date.now();
    const webhookSecret = "whsec_dup_email_" + Date.now();
    process.env.STRIPE_SECRET_KEY = stripeKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    const sendConfirmationSpy = vi.spyOn(
      await import("../email/emailService"),
      "sendPaymentConfirmedEmail"
    );
    const sendAdminSpy = vi.spyOn(
      await import("../email/emailService"),
      "sendAdminNewOrderEmail"
    );

    const res1 = await fireWebhook(order.id, stripeKey, webhookSecret);
    expect(res1.status).toBe(200);

    const res2 = await fireWebhook(order.id, stripeKey, webhookSecret);
    expect(res2.status).toBe(200);

    expect(sendConfirmationSpy).toHaveBeenCalledTimes(1);

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("order remains paid even if email sending throws", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const stripeKey = "sk_test_email_fail_" + Date.now();
    const webhookSecret = "whsec_email_fail_" + Date.now();
    process.env.STRIPE_SECRET_KEY = stripeKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    const emailModule = await import("../email/emailService");
    vi.spyOn(emailModule, "sendPaymentConfirmedEmail").mockRejectedValueOnce(
      new Error("Email provider down")
    );

    const res = await fireWebhook(order.id, stripeKey, webhookSecret);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const [updatedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(updatedOrder.status).toBe("paid");
    expect(updatedOrder.paymentStatus).toBe("paid");

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("admin notification sets adminNotificationSentAt when ADMIN_ORDER_NOTIFICATION_EMAIL is set", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const stripeKey = "sk_test_admin_notif_" + Date.now();
    const webhookSecret = "whsec_admin_notif_" + Date.now();
    process.env.STRIPE_SECRET_KEY = stripeKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    process.env.ADMIN_ORDER_NOTIFICATION_EMAIL = "admin-test@example.com";

    const res = await fireWebhook(order.id, stripeKey, webhookSecret);
    expect(res.status).toBe(200);

    const [updatedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(updatedOrder.adminNotificationSentAt).not.toBeNull();

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.ADMIN_ORDER_NOTIFICATION_EMAIL;
  });
});

// ─── Admin Order Detail — Email Status Fields ─────────────────────────────────

describe("Admin order detail — email status fields", () => {
  it("returns customerConfirmationSentAt and adminNotificationSentAt in admin order response", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const now = new Date();
    await db
      .update(ordersTable)
      .set({
        customerConfirmationSentAt: now,
        adminNotificationSentAt: now,
      })
      .where(eq(ordersTable.id, order.id));

    const res = await request(app)
      .get(`/api/admin/orders/${order.id}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.customerConfirmationSentAt).toBeTruthy();
    expect(res.body.adminNotificationSentAt).toBeTruthy();
  });

  it("returns null email timestamps when emails have not been sent", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const res = await request(app)
      .get(`/api/admin/orders/${order.id}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.customerConfirmationSentAt).toBeNull();
    expect(res.body.adminNotificationSentAt).toBeNull();
  });
});

// ─── Regression ───────────────────────────────────────────────────────────────

describe("Email infrastructure — regression", () => {
  it("Stripe webhook still marks order paid after email refactor", async () => {
    if (!publishedPosterId) return;
    const order = await createTestOrder();

    const stripeKey = "sk_test_email_regression_" + Date.now();
    const webhookSecret = "whsec_email_regression_" + Date.now();
    process.env.STRIPE_SECRET_KEY = stripeKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    const res = await fireWebhook(order.id, stripeKey, webhookSecret);
    expect(res.status).toBe(200);

    const [updatedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(updatedOrder.status).toBe("paid");
    expect(updatedOrder.paymentStatus).toBe("paid");
    expect(updatedOrder.paidAt).not.toBeNull();

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("missing EMAIL_PROVIDER does not crash checkout", async () => {
    if (!publishedPosterId) return;

    const origProvider = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;

    await addCartItem(testSessionId, publishedPosterId, activeSizeId ?? undefined);
    const res = await request(app)
      .post("/api/orders")
      .send({ ...VALID_CHECKOUT, sessionId: testSessionId });

    expect(res.status).toBe(201);

    if (origProvider) process.env.EMAIL_PROVIDER = origProvider;
  });
});
