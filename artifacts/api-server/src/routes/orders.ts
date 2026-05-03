import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  postersTable,
  posterSizesTable,
} from "@workspace/db";
import { eq, and, desc, count, inArray, ne } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";

const router = Router();

const CreateOrderBodySchema = z.object({
  storeKey: z.string().min(1),
  sessionId: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional().nullable(),
  shippingName: z.string().min(1),
  shippingAddressLine1: z.string().min(1),
  shippingAddressLine2: z.string().optional().nullable(),
  shippingPostalCode: z.string().min(1),
  shippingCity: z.string().min(1),
  shippingRegion: z.string().optional().nullable(),
  shippingCountry: z.string().min(1),
  shippingMethodId: z.number().int().optional().nullable(),
  customerNotes: z.string().optional().nullable(),
  newsletterOptIn: z.boolean().optional().default(false),
  currency: z.string().optional(),
});

const UpdateOrderStatusSchema = z.object({
  status: z.enum(["draft", "pending_payment", "paid", "processing", "shipped", "cancelled"]),
});

const FULFILLMENT_STATUSES = ["not_started", "ready_for_production", "in_production", "shipped", "cancelled"] as const;

const UpdateFulfillmentSchema = z.object({
  fulfillmentStatus: z.enum(FULFILLMENT_STATUSES).optional(),
  fulfillmentNotes: z.string().nullable().optional(),
  trackingNumber: z.string().nullable().optional(),
  trackingUrl: z.string().nullable().optional(),
  markShipped: z.boolean().optional(),
  markInProduction: z.boolean().optional(),
});

function serializeOrderItem(item: typeof orderItemsTable.$inferSelect) {
  return {
    ...item,
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
    widthCmSnapshot: item.widthCmSnapshot != null ? Number(item.widthCmSnapshot) : null,
    heightCmSnapshot: item.heightCmSnapshot != null ? Number(item.heightCmSnapshot) : null,
    createdAt: item.createdAt.toISOString(),
  };
}

function serializeOrder(
  order: typeof ordersTable.$inferSelect & {
    customerPhone?: string | null;
    selectedShippingMethodId?: number | null;
    selectedShippingMethodName?: string | null;
    selectedShippingMethodCourier?: string | null;
    selectedShippingMethodEstimate?: string | null;
  },
  items: (typeof orderItemsTable.$inferSelect)[]
) {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    shippingCost: Number(order.shippingCost),
    total: Number(order.total),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    customerConfirmationSentAt: order.customerConfirmationSentAt?.toISOString() ?? null,
    adminNotificationSentAt: order.adminNotificationSentAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    productionStartedAt: order.productionStartedAt?.toISOString() ?? null,
    items: items.map(serializeOrderItem),
  };
}

async function getOrderRaw(id: number, client: any) {
  const result = await client.query(
    `SELECT o.*, 
      o.customer_phone as "customerPhone",
      o.selected_shipping_method_id as "selectedShippingMethodId",
      o.selected_shipping_method_name as "selectedShippingMethodName",
      o.selected_shipping_method_courier as "selectedShippingMethodCourier",
      o.selected_shipping_method_estimate as "selectedShippingMethodEstimate"
     FROM orders o WHERE o.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

router.post("/orders", async (req, res) => {
  const parsed = CreateOrderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const {
    storeKey,
    sessionId,
    customerEmail,
    customerPhone,
    shippingName,
    shippingAddressLine1,
    shippingAddressLine2,
    shippingPostalCode,
    shippingCity,
    shippingRegion,
    shippingCountry,
    shippingMethodId,
    customerNotes,
    newsletterOptIn,
    currency: requestedCurrency,
  } = parsed.data;

  const cartRows = await db
    .select()
    .from(cartItemsTable)
    .leftJoin(postersTable, eq(cartItemsTable.posterId, postersTable.id))
    .where(
      and(
        eq(cartItemsTable.sessionId, sessionId),
        eq(cartItemsTable.storeKey, storeKey)
      )
    );

  if (cartRows.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const invalidItems: { posterId: number; reason: string }[] = [];

  for (const row of cartRows) {
    if (!row.posters) {
      invalidItems.push({ posterId: row.cart_items.posterId, reason: "Poster not found" });
      continue;
    }
    if (row.posters.status !== "published") {
      invalidItems.push({ posterId: row.cart_items.posterId, reason: "Poster is no longer available" });
      continue;
    }
    if (row.posters.storeKey !== storeKey) {
      invalidItems.push({ posterId: row.cart_items.posterId, reason: "Poster does not belong to this store" });
    }
  }

  const posterSizeIds = cartRows
    .map(r => r.cart_items.posterSizeId)
    .filter((id): id is number => id != null);

  const sizesFromDb = posterSizeIds.length > 0
    ? await db
        .select()
        .from(posterSizesTable)
        .where(inArray(posterSizesTable.id, posterSizeIds))
    : [];

  const sizeMap = new Map(sizesFromDb.map(s => [s.id, s]));

  for (const row of cartRows) {
    const sizeId = row.cart_items.posterSizeId;
    if (sizeId != null) {
      const size = sizeMap.get(sizeId);
      if (!size) {
        invalidItems.push({ posterId: row.cart_items.posterId, reason: "Selected size not found" });
      } else if (!size.active) {
        invalidItems.push({ posterId: row.cart_items.posterId, reason: "Selected size is no longer available" });
      }
    }
  }

  if (invalidItems.length > 0) {
    return res.status(400).json({ error: "Some cart items are no longer valid", invalidItems });
  }

  let subtotal = 0;
  const currency = requestedCurrency || cartRows[0]?.posters?.currency || "EUR";

  const itemsToInsert = cartRows.map(row => {
    const poster = row.posters!;
    const sizeId = row.cart_items.posterSizeId;
    const posterSize = sizeId != null ? sizeMap.get(sizeId) : undefined;

    const unitPrice = posterSize ? Number(posterSize.price) : Number(poster.price);
    const qty = row.cart_items.quantity;
    const itemTotal = Math.round(unitPrice * qty * 100) / 100;
    subtotal += itemTotal;

    return {
      orderId: 0,
      posterId: poster.id,
      posterSizeId: sizeId ?? null,
      posterTitleSnapshot: poster.title,
      sizeLabelSnapshot: posterSize?.sizeLabel ?? (row.cart_items.size ?? null),
      widthCmSnapshot: null as string | null,
      heightCmSnapshot: null as string | null,
      unitPrice: String(unitPrice),
      currency: posterSize?.currency ?? poster.currency,
      quantity: qty,
      totalPrice: String(itemTotal),
      masterPrintImageUrlSnapshot: poster.masterPrintImageUrl ?? null,
      previewImageUrlSnapshot: poster.previewImageUrl ?? poster.imageUrl ?? null,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;

  let shippingCost = 0;
  let selectedShippingMethodName: string | null = null;
  let selectedShippingMethodCourier: string | null = null;
  let selectedShippingMethodEstimate: string | null = null;
  let resolvedShippingMethodId: number | null = null;

  if (shippingMethodId) {
    const client = await pool.connect();
    try {
      const methodRes = await client.query(
        "SELECT * FROM shipping_methods WHERE id = $1 AND active = TRUE",
        [shippingMethodId]
      );
      if (methodRes.rows.length > 0) {
        const method = methodRes.rows[0];
        shippingCost = Number(method.price);
        selectedShippingMethodName = method.name;
        selectedShippingMethodCourier = method.courier_name ?? null;
        selectedShippingMethodEstimate = method.delivery_estimate ?? null;
        resolvedShippingMethodId = method.id;
      }
    } finally {
      client.release();
    }
  }

  const total = Math.round((subtotal + shippingCost) * 100) / 100;

  const dbClient = await pool.connect();
  try {
    const orderRes = await dbClient.query(
      `INSERT INTO orders (
        store_key, customer_email, customer_phone, status,
        subtotal, shipping_cost, total, currency,
        shipping_name, shipping_address_line1, shipping_address_line2,
        shipping_postal_code, shipping_city, shipping_region, shipping_country,
        selected_shipping_method_id, selected_shipping_method_name,
        selected_shipping_method_courier, selected_shipping_method_estimate,
        customer_notes, newsletter_opt_in
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *`,
      [
        storeKey, customerEmail, customerPhone ?? null, "pending_payment",
        String(subtotal), String(shippingCost), String(total), currency,
        shippingName, shippingAddressLine1, shippingAddressLine2 ?? null,
        shippingPostalCode, shippingCity, shippingRegion ?? null, shippingCountry,
        resolvedShippingMethodId, selectedShippingMethodName,
        selectedShippingMethodCourier, selectedShippingMethodEstimate,
        customerNotes ?? null, newsletterOptIn ?? false,
      ]
    );

    const order = orderRes.rows[0];

    const itemRows = await db
      .insert(orderItemsTable)
      .values(itemsToInsert.map(item => ({ ...item, orderId: order.id })))
      .returning();

    await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));

    const serializedOrder = {
      id: order.id,
      storeKey: order.store_key,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone ?? null,
      status: order.status,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shipping_cost),
      total: Number(order.total),
      currency: order.currency,
      shippingName: order.shipping_name,
      shippingAddressLine1: order.shipping_address_line1,
      shippingAddressLine2: order.shipping_address_line2 ?? null,
      shippingPostalCode: order.shipping_postal_code,
      shippingCity: order.shipping_city,
      shippingRegion: order.shipping_region ?? null,
      shippingCountry: order.shipping_country,
      selectedShippingMethodId: order.selected_shipping_method_id ?? null,
      selectedShippingMethodName: order.selected_shipping_method_name ?? null,
      selectedShippingMethodCourier: order.selected_shipping_method_courier ?? null,
      selectedShippingMethodEstimate: order.selected_shipping_method_estimate ?? null,
      customerNotes: order.customer_notes ?? null,
      newsletterOptIn: order.newsletter_opt_in,
      stripeCheckoutSessionId: order.stripe_checkout_session_id ?? null,
      stripePaymentIntentId: order.stripe_payment_intent_id ?? null,
      paymentStatus: order.payment_status ?? null,
      paidAt: order.paid_at?.toISOString() ?? null,
      cancelledAt: order.cancelled_at?.toISOString() ?? null,
      customerConfirmationSentAt: order.customer_confirmation_sent_at?.toISOString() ?? null,
      adminNotificationSentAt: order.admin_notification_sent_at?.toISOString() ?? null,
      fulfillmentStatus: order.fulfillment_status ?? "not_started",
      fulfillmentNotes: order.fulfillment_notes ?? null,
      shippedAt: order.shipped_at?.toISOString() ?? null,
      trackingNumber: order.tracking_number ?? null,
      trackingUrl: order.tracking_url ?? null,
      productionStartedAt: order.production_started_at?.toISOString() ?? null,
      createdAt: order.created_at?.toISOString(),
      updatedAt: order.updated_at?.toISOString(),
      items: itemRows.map(serializeOrderItem),
    };

    return res.status(201).json(serializedOrder);
  } finally {
    dbClient.release();
  }
});

router.get("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return res.status(404).json({ error: "Not found" });

  const dbClient = await pool.connect();
  try {
    const extraRes = await dbClient.query(
      `SELECT customer_phone, selected_shipping_method_id, selected_shipping_method_name,
              selected_shipping_method_courier, selected_shipping_method_estimate
       FROM orders WHERE id = $1`,
      [id]
    );
    const extra = extraRes.rows[0] ?? {};
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

    return res.json({
      ...serializeOrder(order, items),
      customerPhone: extra.customer_phone ?? null,
      selectedShippingMethodId: extra.selected_shipping_method_id ?? null,
      selectedShippingMethodName: extra.selected_shipping_method_name ?? null,
      selectedShippingMethodCourier: extra.selected_shipping_method_courier ?? null,
      selectedShippingMethodEstimate: extra.selected_shipping_method_estimate ?? null,
    });
  } finally {
    dbClient.release();
  }
});

router.get("/user/orders", requireAuth, async (req, res) => {
  const user = req.user!;
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;

  const dbClient = await pool.connect();
  try {
    const result = await dbClient.query(
      `SELECT * FROM orders WHERE customer_email = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [user.email, limit, offset]
    );
    const countRes = await dbClient.query(
      `SELECT COUNT(*) FROM orders WHERE customer_email = $1`,
      [user.email]
    );

    const orderIds = result.rows.map((r: any) => r.id);
    let allItems: any[] = [];
    if (orderIds.length > 0) {
      const itemsRes = await dbClient.query(
        `SELECT * FROM order_items WHERE order_id = ANY($1)`,
        [orderIds]
      );
      allItems = itemsRes.rows;
    }

    const itemsByOrder = new Map<number, any[]>();
    for (const item of allItems) {
      const arr = itemsByOrder.get(item.order_id) ?? [];
      arr.push({
        id: item.id,
        orderId: item.order_id,
        posterId: item.poster_id,
        posterSizeId: item.poster_size_id ?? null,
        posterTitleSnapshot: item.poster_title_snapshot,
        sizeLabelSnapshot: item.size_label_snapshot ?? null,
        unitPrice: Number(item.unit_price),
        currency: item.currency,
        quantity: item.quantity,
        totalPrice: Number(item.total_price),
        previewImageUrlSnapshot: item.preview_image_url_snapshot ?? null,
        createdAt: item.created_at?.toISOString(),
      });
      itemsByOrder.set(item.order_id, arr);
    }

    const orders = result.rows.map((o: any) => ({
      id: o.id,
      storeKey: o.store_key,
      customerEmail: o.customer_email,
      status: o.status,
      subtotal: Number(o.subtotal),
      shippingCost: Number(o.shipping_cost),
      total: Number(o.total),
      currency: o.currency,
      shippingName: o.shipping_name,
      shippingCity: o.shipping_city,
      shippingCountry: o.shipping_country,
      selectedShippingMethodName: o.selected_shipping_method_name ?? null,
      selectedShippingMethodEstimate: o.selected_shipping_method_estimate ?? null,
      paidAt: o.paid_at?.toISOString() ?? null,
      fulfillmentStatus: o.fulfillment_status ?? "not_started",
      trackingNumber: o.tracking_number ?? null,
      createdAt: o.created_at?.toISOString(),
      updatedAt: o.updated_at?.toISOString(),
      items: itemsByOrder.get(o.id) ?? [],
    }));

    return res.json({
      orders,
      total: Number(countRes.rows[0]?.count ?? 0),
      offset,
      limit,
    });
  } finally {
    dbClient.release();
  }
});

router.get("/admin/orders", requireAdmin, async (req, res) => {
  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const fulfillmentStatus = typeof req.query.fulfillmentStatus === "string" ? req.query.fulfillmentStatus : undefined;
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const conditions = [];
  if (storeKey) conditions.push(eq(ordersTable.storeKey, storeKey));
  if (status) conditions.push(eq(ordersTable.status, status));
  if (fulfillmentStatus) conditions.push(eq(ordersTable.fulfillmentStatus, fulfillmentStatus));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, orders] = await Promise.all([
    db.select({ count: count() }).from(ordersTable).where(whereClause),
    db
      .select()
      .from(ordersTable)
      .where(whereClause)
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const orderIds = orders.map(o => o.id);
  const allItems = orderIds.length > 0
    ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<number, (typeof orderItemsTable.$inferSelect)[]>();
  for (const item of allItems) {
    const arr = itemsByOrder.get(item.orderId) ?? [];
    arr.push(item);
    itemsByOrder.set(item.orderId, arr);
  }

  const dbClient = await pool.connect();
  try {
    const extraFields: Record<number, any> = {};
    if (orderIds.length > 0) {
      const extraRes = await dbClient.query(
        `SELECT id, customer_phone, selected_shipping_method_id, selected_shipping_method_name,
                selected_shipping_method_courier, selected_shipping_method_estimate
         FROM orders WHERE id = ANY($1)`,
        [orderIds]
      );
      for (const row of extraRes.rows) {
        extraFields[row.id] = row;
      }
    }

    return res.json({
      orders: orders.map(o => ({
        ...serializeOrder(o, itemsByOrder.get(o.id) ?? []),
        customerPhone: extraFields[o.id]?.customer_phone ?? null,
        selectedShippingMethodId: extraFields[o.id]?.selected_shipping_method_id ?? null,
        selectedShippingMethodName: extraFields[o.id]?.selected_shipping_method_name ?? null,
        selectedShippingMethodCourier: extraFields[o.id]?.selected_shipping_method_courier ?? null,
        selectedShippingMethodEstimate: extraFields[o.id]?.selected_shipping_method_estimate ?? null,
      })),
      total: Number(totalResult[0]?.count ?? 0),
      offset,
      limit,
    });
  } finally {
    dbClient.release();
  }
});

router.get("/admin/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return res.status(404).json({ error: "Not found" });

  const dbClient = await pool.connect();
  try {
    const extraRes = await dbClient.query(
      `SELECT customer_phone, selected_shipping_method_id, selected_shipping_method_name,
              selected_shipping_method_courier, selected_shipping_method_estimate
       FROM orders WHERE id = $1`,
      [id]
    );
    const extra = extraRes.rows[0] ?? {};
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

    return res.json({
      ...serializeOrder(order, items),
      customerPhone: extra.customer_phone ?? null,
      selectedShippingMethodId: extra.selected_shipping_method_id ?? null,
      selectedShippingMethodName: extra.selected_shipping_method_name ?? null,
      selectedShippingMethodCourier: extra.selected_shipping_method_courier ?? null,
      selectedShippingMethodEstimate: extra.selected_shipping_method_estimate ?? null,
    });
  } finally {
    dbClient.release();
  }
});

router.patch("/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = UpdateOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid status", details: parsed.error.flatten() });
  }

  const [order] = await db
    .update(ordersTable)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) return res.status(404).json({ error: "Not found" });

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

  return res.json(serializeOrder(order, items));
});

router.patch("/admin/orders/:id/fulfillment", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = UpdateFulfillmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const updateFields: Partial<typeof ordersTable.$inferSelect> = { updatedAt: new Date() };

  if (parsed.data.fulfillmentStatus !== undefined) {
    updateFields.fulfillmentStatus = parsed.data.fulfillmentStatus;
  }
  if (parsed.data.fulfillmentNotes !== undefined) {
    updateFields.fulfillmentNotes = parsed.data.fulfillmentNotes;
  }
  if (parsed.data.trackingNumber !== undefined) {
    updateFields.trackingNumber = parsed.data.trackingNumber;
  }
  if (parsed.data.trackingUrl !== undefined) {
    updateFields.trackingUrl = parsed.data.trackingUrl;
  }
  if (parsed.data.markShipped) {
    updateFields.fulfillmentStatus = "shipped";
    updateFields.shippedAt = new Date();
    if (existing.status !== "shipped") {
      updateFields.status = "shipped";
    }
  }
  if (parsed.data.markInProduction) {
    if (!existing.productionStartedAt) {
      updateFields.productionStartedAt = new Date();
    }
    updateFields.fulfillmentStatus = "in_production";
  }

  const [order] = await db
    .update(ordersTable)
    .set(updateFields)
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) return res.status(404).json({ error: "Not found" });

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

  return res.json(serializeOrder(order, items));
});

router.get("/admin/fulfillment", requireAdmin, async (req, res) => {
  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  const fulfillmentStatus = typeof req.query.fulfillmentStatus === "string" ? req.query.fulfillmentStatus : undefined;
  const orderStatus = typeof req.query.orderStatus === "string" ? req.query.orderStatus : undefined;
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const conditions = [];

  if (storeKey) conditions.push(eq(ordersTable.storeKey, storeKey));

  if (fulfillmentStatus) {
    conditions.push(eq(ordersTable.fulfillmentStatus, fulfillmentStatus));
  }

  if (orderStatus) {
    conditions.push(eq(ordersTable.status, orderStatus));
  } else {
    conditions.push(eq(ordersTable.status, "paid"));
  }

  if (!fulfillmentStatus) {
    conditions.push(ne(ordersTable.fulfillmentStatus, "shipped"));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, orders] = await Promise.all([
    db.select({ count: count() }).from(ordersTable).where(whereClause),
    db
      .select()
      .from(ordersTable)
      .where(whereClause)
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const orderIds = orders.map(o => o.id);
  const allItems = orderIds.length > 0
    ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<number, (typeof orderItemsTable.$inferSelect)[]>();
  for (const item of allItems) {
    const arr = itemsByOrder.get(item.orderId) ?? [];
    arr.push(item);
    itemsByOrder.set(item.orderId, arr);
  }

  return res.json({
    orders: orders.map(o => serializeOrder(o, itemsByOrder.get(o.id) ?? [])),
    total: Number(totalResult[0]?.count ?? 0),
    offset,
    limit,
  });
});

router.get("/admin/fulfillment/export.csv", requireAdmin, async (req, res) => {
  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  const fulfillmentStatus = typeof req.query.fulfillmentStatus === "string" ? req.query.fulfillmentStatus : undefined;
  const orderStatus = typeof req.query.orderStatus === "string" ? req.query.orderStatus : undefined;

  const conditions = [];
  if (storeKey) conditions.push(eq(ordersTable.storeKey, storeKey));
  if (fulfillmentStatus) conditions.push(eq(ordersTable.fulfillmentStatus, fulfillmentStatus));
  if (orderStatus) conditions.push(eq(ordersTable.status, orderStatus));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(whereClause)
    .orderBy(desc(ordersTable.createdAt))
    .limit(1000);

  const orderIds = orders.map(o => o.id);
  const allItems = orderIds.length > 0
    ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<number, (typeof orderItemsTable.$inferSelect)[]>();
  for (const item of allItems) {
    const arr = itemsByOrder.get(item.orderId) ?? [];
    arr.push(item);
    itemsByOrder.set(item.orderId, arr);
  }

  const FULFILLMENT_LABEL: Record<string, string> = {
    not_started: "Not Started",
    ready_for_production: "Ready for Production",
    in_production: "In Production",
    shipped: "Shipped",
    cancelled: "Cancelled",
  };

  const ORDER_STATUS_LABEL: Record<string, string> = {
    draft: "Draft",
    pending_payment: "Pending Payment",
    paid: "Paid",
    processing: "Processing",
    shipped: "Shipped",
    cancelled: "Cancelled",
  };

  function fmtDate(d: Date | null | undefined): string {
    if (!d) return "";
    return d.toISOString().replace("T", " ").slice(0, 16);
  }

  const HEADERS = [
    "Order ID", "Store", "Order Date", "Order Status", "Fulfillment Status",
    "Customer Email", "Shipping Name", "Address Line 1", "Address Line 2",
    "Postal Code", "City", "Country", "Poster Title", "Size",
    "Width (cm)", "Height (cm)", "Quantity", "Unit Price", "Currency",
    "Order Total", "Master Print File URL", "Preview Image URL",
    "Tracking Number", "Tracking URL", "Production Started", "Shipped At", "Fulfillment Notes",
  ];

  const csvLines: string[] = [];
  csvLines.push(HEADERS.map(h => csvEscape(h)).join(","));

  for (const order of orders) {
    const items = itemsByOrder.get(order.id) ?? [];
    const baseRow = [
      String(order.id), order.storeKey, fmtDate(order.createdAt),
      ORDER_STATUS_LABEL[order.status] ?? order.status,
      FULFILLMENT_LABEL[order.fulfillmentStatus ?? "not_started"] ?? order.fulfillmentStatus ?? "Not Started",
      order.customerEmail, order.shippingName, order.shippingAddressLine1,
      order.shippingAddressLine2 ?? "", order.shippingPostalCode, order.shippingCity, order.shippingCountry,
    ];
    const trailingRow = [
      order.trackingNumber ?? "", order.trackingUrl ?? "",
      fmtDate(order.productionStartedAt), fmtDate(order.shippedAt),
      order.fulfillmentNotes ?? "",
    ];

    if (items.length === 0) {
      csvLines.push([
        ...baseRow,
        "", "", "", "", "", "", "", String(Number(order.total)), order.currency,
        ...trailingRow,
      ].map(csvEscape).join(","));
    } else {
      for (const item of items) {
        csvLines.push([
          ...baseRow,
          item.posterTitleSnapshot,
          item.sizeLabelSnapshot ?? "",
          item.widthCmSnapshot != null ? String(Number(item.widthCmSnapshot)) : "",
          item.heightCmSnapshot != null ? String(Number(item.heightCmSnapshot)) : "",
          String(item.quantity), String(Number(item.unitPrice)), item.currency,
          String(Number(order.total)),
          item.masterPrintImageUrlSnapshot ?? "",
          item.previewImageUrlSnapshot ?? "",
          ...trailingRow,
        ].map(csvEscape).join(","));
      }
    }
  }

  const exportDate = new Date().toISOString().slice(0, 10);
  const filename = `fulfillment-export-${exportDate}.csv`;
  const BOM = "\uFEFF";
  const body = BOM + csvLines.join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(body);
});

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;
