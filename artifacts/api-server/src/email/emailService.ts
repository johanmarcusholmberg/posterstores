import { logger } from "../lib/logger";
import { ordersTable, orderItemsTable } from "@workspace/db";

export type EmailProvider = "resend" | "mock";

export interface EmailPayload {
  to: string;
  from: string;
  subject: string;
  html: string;
}

function getProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER?.toLowerCase();
  if (configured === "resend") return "resend";
  return "mock";
}

function getFrom(): string {
  return process.env.EMAIL_FROM || "noreply@example.com";
}

function storeDisplayName(storeKey: string): string {
  const map: Record<string, string> = {
    postsofspain: "PostersofSpain",
  };
  return map[storeKey] ?? storeKey;
}

async function sendViaResend(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set, falling back to mock sender");
    logMockEmail(payload);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error ${response.status}: ${error}`);
  }
}

function logMockEmail(payload: EmailPayload): void {
  logger.info(
    {
      mockEmail: true,
      to: payload.to,
      from: payload.from,
      subject: payload.subject,
      htmlLength: payload.html.length,
    },
    "[mock-email] Email would be sent (no provider configured)"
  );
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  const provider = getProvider();

  if (provider === "resend") {
    await sendViaResend(payload);
    return;
  }

  logMockEmail(payload);
}

function buildItemRows(items: (typeof orderItemsTable.$inferSelect)[]): string {
  return items
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
}

function buildCustomerConfirmationHtml(
  order: typeof ordersTable.$inferSelect,
  items: (typeof orderItemsTable.$inferSelect)[],
  storeName: string
): string {
  const itemRows = buildItemRows(items);
  const addrLine2 = order.shippingAddressLine2 ? `<br>${order.shippingAddressLine2}` : "";
  const region = order.shippingRegion ? `, ${order.shippingRegion}` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f6f1;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f1;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#1a1a1a;padding:32px 40px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:normal;letter-spacing:0.05em;">${storeName}</h1>
            <p style="margin:6px 0 0;color:#aaa;font-size:13px;">Order #${order.id} — Confirmed</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 24px;color:#333;font-size:15px;">
              Hi <strong>${order.shippingName}</strong>, thank you for your purchase!
              Your payment has been confirmed and your order will be processed shortly.
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
}

function buildAdminNotificationHtml(
  order: typeof ordersTable.$inferSelect,
  items: (typeof orderItemsTable.$inferSelect)[],
  storeName: string
): string {
  const itemRows = buildItemRows(items);
  const adminBaseUrl = process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/admin/orders/${order.id}`
    : null;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1a1a1a;padding:24px 32px;">
            <h1 style="margin:0;color:#fff;font-size:18px;font-weight:bold;">New Paid Order — ${storeName} #${order.id}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#333;margin-bottom:20px;">
              <tr>
                <td style="padding:4px 0;color:#888;width:140px;">Store</td>
                <td style="padding:4px 0;font-weight:bold;">${storeName} (${order.storeKey})</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#888;">Order ID</td>
                <td style="padding:4px 0;">#${order.id}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#888;">Customer</td>
                <td style="padding:4px 0;">${order.customerEmail}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#888;">Total</td>
                <td style="padding:4px 0;font-weight:bold;color:#111;">${order.total} ${order.currency}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#888;">Shipping To</td>
                <td style="padding:4px 0;">${order.shippingName}, ${order.shippingCity}, ${order.shippingCountry}</td>
              </tr>
            </table>

            <h2 style="margin:0 0 10px;font-size:14px;color:#555;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #eee;padding-bottom:6px;">Items</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#333;margin-bottom:20px;">
              <thead>
                <tr style="background:#f8f8f8;">
                  <th style="padding:6px 8px;text-align:left;">Item</th>
                  <th style="padding:6px 8px;text-align:left;">Size</th>
                  <th style="padding:6px 8px;text-align:center;">Qty</th>
                  <th style="padding:6px 8px;text-align:right;">Price</th>
                  <th style="padding:6px 8px;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>

            ${adminBaseUrl ? `<p style="margin:20px 0 0;"><a href="${adminBaseUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:13px;">View Order in Admin</a></p>` : ""}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendPaymentConfirmedEmail(
  order: typeof ordersTable.$inferSelect,
  items: (typeof orderItemsTable.$inferSelect)[]
): Promise<void> {
  const storeName = storeDisplayName(order.storeKey);
  const from = getFrom();

  const payload: EmailPayload = {
    to: order.customerEmail,
    from,
    subject: `Your ${storeName} order is confirmed — #${order.id}`,
    html: buildCustomerConfirmationHtml(order, items, storeName),
  };

  await sendEmail(payload);
  logger.info({ orderId: order.id, to: order.customerEmail }, "Customer payment confirmation email sent");
}

export async function sendAdminNewOrderEmail(
  order: typeof ordersTable.$inferSelect,
  items: (typeof orderItemsTable.$inferSelect)[]
): Promise<void> {
  const adminEmail = process.env.ADMIN_ORDER_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    logger.info({ orderId: order.id }, "ADMIN_ORDER_NOTIFICATION_EMAIL not set, skipping admin notification");
    return;
  }

  const storeName = storeDisplayName(order.storeKey);
  const from = getFrom();

  const payload: EmailPayload = {
    to: adminEmail,
    from,
    subject: `New paid order — ${storeName} #${order.id}`,
    html: buildAdminNotificationHtml(order, items, storeName),
  };

  await sendEmail(payload);
  logger.info({ orderId: order.id, to: adminEmail }, "Admin new order notification email sent");
}

export async function sendOrderCreatedEmail(
  _order: typeof ordersTable.$inferSelect,
  _items: (typeof orderItemsTable.$inferSelect)[]
): Promise<void> {
  logger.info({ orderId: _order.id }, "sendOrderCreatedEmail: pending-payment email not implemented (skipped by design)");
}
