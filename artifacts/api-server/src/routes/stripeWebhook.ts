import { type RequestHandler } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendPaymentConfirmedEmail, sendAdminNewOrderEmail } from "../email/emailService";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

export const stripeWebhookHandler: RequestHandler = async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET is not configured");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    res.status(500).json({ error: "Stripe is not configured" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err: any) {
    logger.warn({ err: err.message }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    return;
  }

  logger.info({ type: event.type }, "Stripe webhook received");

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId ? Number(session.metadata.orderId) : null;

    if (!orderId) {
      logger.warn({ sessionId: session.id }, "checkout.session.completed: no orderId in metadata");
      res.json({ received: true });
      return;
    }

    const paymentStatus = session.payment_status;
    if (paymentStatus !== "paid") {
      logger.info({ orderId, paymentStatus }, "checkout.session.completed but payment not paid yet");
      res.json({ received: true });
      return;
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

    logger.info({ orderId, paymentIntentId }, "Order marked as paid via webhook");

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));

    if (!order) {
      res.json({ received: true });
      return;
    }

    if (!order.customerConfirmationSentAt) {
      try {
        await sendPaymentConfirmedEmail(order, items);
        await db
          .update(ordersTable)
          .set({ customerConfirmationSentAt: new Date() })
          .where(eq(ordersTable.id, orderId));
      } catch (err) {
        logger.error({ err, orderId }, "Failed to send customer confirmation email — order remains paid");
      }
    } else {
      logger.info({ orderId }, "Customer confirmation email already sent — skipping (idempotent)");
    }

    if (!order.adminNotificationSentAt) {
      try {
        await sendAdminNewOrderEmail(order, items);
        await db
          .update(ordersTable)
          .set({ adminNotificationSentAt: new Date() })
          .where(eq(ordersTable.id, orderId));
      } catch (err) {
        logger.error({ err, orderId }, "Failed to send admin notification email — order remains paid");
      }
    } else {
      logger.info({ orderId }, "Admin notification email already sent — skipping (idempotent)");
    }

  } else if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId ? Number(session.metadata.orderId) : null;

    if (orderId) {
      await db
        .update(ordersTable)
        .set({
          paymentStatus: "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ordersTable.id, orderId));

      logger.info({ orderId }, "Order checkout session expired");
    }

  } else if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.stripePaymentIntentId, paymentIntent.id));

    if (order) {
      await db
        .update(ordersTable)
        .set({ paymentStatus: "failed", updatedAt: new Date() })
        .where(eq(ordersTable.id, order.id));

      logger.info({ orderId: order.id }, "Payment failed");
    }
  }

  res.json({ received: true });
};
