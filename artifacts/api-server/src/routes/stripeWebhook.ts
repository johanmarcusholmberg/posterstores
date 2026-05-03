import { type RequestHandler } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2025-04-30.basil" });
}

async function sendOrderConfirmationEmail(
  order: typeof ordersTable.$inferSelect,
  items: (typeof orderItemsTable.$inferSelect)[]
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set, skipping confirmation email");
    return;
  }

  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.posterTitleSnapshot}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.sizeLabelSnapshot ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${item.unitPrice} ${item.currency}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${item.totalPrice} ${item.currency}</td>
      </tr>`
    )
    .join("");

  const addrLine2 = order.shippingAddressLine2 ? `<br>${order.shippingAddressLine2}` : "";
  const region = order.shippingRegion ? `, ${order.shippingRegion}` : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f6f1;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f1;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#1a1a1a;padding:32px 40px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:normal;letter-spacing:0.05em;">Order Confirmed</h1>
            <p style="margin:6px 0 0;color:#aaa;font-size:13px;">Order #${order.id}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 24px;color:#333;font-size:15px;">
              Hi <strong>${order.shippingName}</strong>, thank you for your purchase!
              Your order has been confirmed and will be processed shortly.
            </p>

            <h2 style="margin:0 0 12px;font-size:16px;color:#111;border-bottom:2px solid #f0ece4;padding-bottom:8px;">Items Ordered</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#333;">
              <thead>
                <tr style="background:#f9f6f1;">
                  <th style="padding:8px 12px;text-align:left;">Item</th>
                  <th style="padding:8px 12px;text-align:left;">Size</th>
                  <th style="padding:8px 12px;text-align:center;">Qty</th>
                  <th style="padding:8px 12px;text-align:right;">Price</th>
                  <th style="padding:8px 12px;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:14px;color:#555;">
              <tr>
                <td style="padding:4px 12px;">Subtotal</td>
                <td style="padding:4px 12px;text-align:right;">${order.subtotal} ${order.currency}</td>
              </tr>
              <tr>
                <td style="padding:4px 12px;">Shipping</td>
                <td style="padding:4px 12px;text-align:right;">${Number(order.shippingCost) === 0 ? "TBD" : `${order.shippingCost} ${order.currency}`}</td>
              </tr>
              <tr style="font-weight:bold;font-size:16px;color:#111;">
                <td style="padding:12px 12px 4px;border-top:2px solid #f0ece4;">Total</td>
                <td style="padding:12px 12px 4px;border-top:2px solid #f0ece4;text-align:right;">${order.total} ${order.currency}</td>
              </tr>
            </table>

            <h2 style="margin:28px 0 10px;font-size:16px;color:#111;border-bottom:2px solid #f0ece4;padding-bottom:8px;">Shipping To</h2>
            <p style="margin:0;font-size:14px;color:#555;line-height:1.7;">
              ${order.shippingName}<br>
              ${order.shippingAddressLine1}${addrLine2}<br>
              ${order.shippingPostalCode} ${order.shippingCity}${region}<br>
              ${order.shippingCountry}
            </p>

            <p style="margin:32px 0 0;font-size:13px;color:#999;text-align:center;">
              If you have any questions about your order, reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [order.customerEmail],
        subject: `Order Confirmed — #${order.id}`,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ orderId: order.id, error }, "Failed to send confirmation email");
    } else {
      logger.info({ orderId: order.id }, "Order confirmation email sent");
    }
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Error sending confirmation email");
  }
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

    if (order) {
      await sendOrderConfirmationEmail(order, items);
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
