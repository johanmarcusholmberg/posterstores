import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendPaymentConfirmedEmail, sendAdminNewOrderEmail } from "../email/emailService";
import { checkoutLimiter } from "../middleware/rateLimiter";

const router = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

router.post("/orders/:id/create-checkout-session", checkoutLimiter, async (req: Request, res: Response) => {
  const orderId = Number(req.params.id);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order id" });

  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : (req.body?.storeKey as string | undefined);
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.storeKey !== storeKey) return res.status(403).json({ error: "Order does not belong to this store" });

  if (order.status === "paid" || order.paymentStatus === "paid") {
    return res.status(400).json({ error: "Order is already paid" });
  }

  if (order.status !== "pending_payment" && order.status !== "draft") {
    return res.status(400).json({ error: "Order is not in a payable state" });
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  if (items.length === 0) return res.status(400).json({ error: "Order has no items" });

  const appBaseUrl =
    process.env.APP_BASE_URL ||
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : null);
  if (!appBaseUrl) return res.status(500).json({ error: "APP_BASE_URL is not configured" });

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    return res.status(500).json({ error: "Stripe is not configured" });
  }

  const currency = order.currency.toLowerCase();

  const lineItems: Array<{ quantity: number; price_data: { currency: string; unit_amount: number; product_data: { name: string; description?: string; images?: string[] } } }> = items.map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency,
      unit_amount: Math.round(Number(item.unitPrice) * 100),
      product_data: {
        name: item.posterTitleSnapshot,
        description: item.sizeLabelSnapshot
          ? `${item.posterTitleSnapshot} — ${item.sizeLabelSnapshot}`
          : item.posterTitleSnapshot,
        ...(item.previewImageUrlSnapshot
          ? { images: [item.previewImageUrlSnapshot] }
          : {}),
      },
    },
  }));

  const shippingCost = Number(order.shippingCost);
  if (shippingCost > 0) {
    const dbClient2 = await (await import("@workspace/db")).pool.connect();
    let shippingName = "Shipping";
    try {
      const extraRes = await dbClient2.query(
        "SELECT selected_shipping_method_name FROM orders WHERE id = $1",
        [orderId]
      );
      if (extraRes.rows[0]?.selected_shipping_method_name) {
        shippingName = extraRes.rows[0].selected_shipping_method_name;
      }
    } finally {
      dbClient2.release();
    }

    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: Math.round(shippingCost * 100),
        product_data: {
          name: shippingName,
        },
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: lineItems,
    success_url: `${appBaseUrl}/order/${orderId}?payment=success`,
    cancel_url: `${appBaseUrl}/checkout?payment=cancelled&orderId=${orderId}`,
    customer_email: order.customerEmail,
    metadata: {
      orderId: String(orderId),
      storeKey,
    },
  });

  await db
    .update(ordersTable)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  logger.info({ orderId, sessionId: session.id }, "Stripe checkout session created");

  return res.json({ checkoutUrl: session.url, sessionId: session.id });
});

// Fallback verification — used when webhook hasn't fired yet (e.g. dev without Stripe CLI)
router.post("/orders/:id/verify-payment", checkoutLimiter, async (req: Request, res: Response) => {
  const orderId = Number(req.params.id);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order id" });

  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : (req.body?.storeKey as string | undefined);
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.storeKey !== storeKey) return res.status(403).json({ error: "Forbidden" });

  if (order.status === "paid") {
    return res.json({ paid: true });
  }

  if (!order.stripeCheckoutSessionId) {
    return res.json({ paid: false });
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    return res.status(500).json({ error: "Stripe is not configured" });
  }

  const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);

  if (session.payment_status !== "paid") {
    return res.json({ paid: false });
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  await db
    .update(ordersTable)
    .set({
      status: "paid",
      paymentStatus: "paid",
      stripePaymentIntentId: paymentIntentId,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId));

  logger.info({ orderId, paymentIntentId }, "Order marked as paid via verify-payment fallback");

  const [updatedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));

  if (updatedOrder) {
    if (!updatedOrder.customerConfirmationSentAt) {
      try {
        await sendPaymentConfirmedEmail(updatedOrder, items);
        await db
          .update(ordersTable)
          .set({ customerConfirmationSentAt: new Date() })
          .where(eq(ordersTable.id, orderId));
      } catch (err) {
        logger.error({ err, orderId }, "Failed to send customer confirmation email via verify-payment fallback");
      }
    }
    if (!updatedOrder.adminNotificationSentAt) {
      try {
        await sendAdminNewOrderEmail(updatedOrder, items);
        await db
          .update(ordersTable)
          .set({ adminNotificationSentAt: new Date() })
          .where(eq(ordersTable.id, orderId));
      } catch (err) {
        logger.error({ err, orderId }, "Failed to send admin notification email via verify-payment fallback");
      }
    }
  }

  return res.json({ paid: true });
});

export default router;
