import { Router } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  postersTable,
  posterSizesTable,
} from "@workspace/db";
import { eq, and, desc, count, inArray, ne } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { z } from "zod";

const router = Router();

const CreateOrderBodySchema = z.object({
  storeKey: z.string().min(1),
  sessionId: z.string().min(1),
  customerEmail: z.string().email(),
  shippingName: z.string().min(1),
  shippingAddressLine1: z.string().min(1),
  shippingAddressLine2: z.string().optional().nullable(),
  shippingPostalCode: z.string().min(1),
  shippingCity: z.string().min(1),
  shippingRegion: z.string().optional().nullable(),
  shippingCountry: z.string().min(1),
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
  order: typeof ordersTable.$inferSelect,
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

router.post("/orders", async (req, res) => {
  const parsed = CreateOrderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const {
    storeKey,
    sessionId,
    customerEmail,
    shippingName,
    shippingAddressLine1,
    shippingAddressLine2,
    shippingPostalCode,
    shippingCity,
    shippingRegion,
    shippingCountry,
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
  const shippingCost = 0;
  const total = subtotal + shippingCost;

  const [order] = await db
    .insert(ordersTable)
    .values({
      storeKey,
      customerEmail,
      status: "pending_payment",
      subtotal: String(subtotal),
      shippingCost: String(shippingCost),
      total: String(total),
      currency,
      shippingName,
      shippingAddressLine1,
      shippingAddressLine2: shippingAddressLine2 ?? null,
      shippingPostalCode,
      shippingCity,
      shippingRegion: shippingRegion ?? null,
      shippingCountry,
      customerNotes: customerNotes ?? null,
      newsletterOptIn: newsletterOptIn ?? false,
    })
    .returning();

  const itemRows = await db
    .insert(orderItemsTable)
    .values(itemsToInsert.map(item => ({ ...item, orderId: order.id })))
    .returning();

  await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));

  return res.status(201).json(serializeOrder(order, itemRows));
});

router.get("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return res.status(404).json({ error: "Not found" });

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

  return res.json(serializeOrder(order, items));
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

  return res.json({
    orders: orders.map(o => serializeOrder(o, itemsByOrder.get(o.id) ?? [])),
    total: Number(totalResult[0]?.count ?? 0),
    offset,
    limit,
  });
});

router.get("/admin/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return res.status(404).json({ error: "Not found" });

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

  return res.json(serializeOrder(order, items));
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

  const csvRows: string[] = [];
  const headers = [
    "order_id",
    "store_key",
    "customer_email",
    "shipping_name",
    "shipping_address_line1",
    "shipping_address_line2",
    "shipping_postal_code",
    "shipping_city",
    "shipping_country",
    "poster_title",
    "size_label",
    "width_cm",
    "height_cm",
    "quantity",
    "master_print_image_url",
    "tracking_number",
    "fulfillment_status",
  ];
  csvRows.push(headers.join(","));

  for (const order of orders) {
    const items = itemsByOrder.get(order.id) ?? [];
    if (items.length === 0) {
      csvRows.push([
        order.id,
        csvEscape(order.storeKey),
        csvEscape(order.customerEmail),
        csvEscape(order.shippingName),
        csvEscape(order.shippingAddressLine1),
        csvEscape(order.shippingAddressLine2 ?? ""),
        csvEscape(order.shippingPostalCode),
        csvEscape(order.shippingCity),
        csvEscape(order.shippingCountry),
        "",
        "",
        "",
        "",
        "",
        "",
        csvEscape(order.trackingNumber ?? ""),
        csvEscape(order.fulfillmentStatus ?? "not_started"),
      ].join(","));
    } else {
      for (const item of items) {
        csvRows.push([
          order.id,
          csvEscape(order.storeKey),
          csvEscape(order.customerEmail),
          csvEscape(order.shippingName),
          csvEscape(order.shippingAddressLine1),
          csvEscape(order.shippingAddressLine2 ?? ""),
          csvEscape(order.shippingPostalCode),
          csvEscape(order.shippingCity),
          csvEscape(order.shippingCountry),
          csvEscape(item.posterTitleSnapshot),
          csvEscape(item.sizeLabelSnapshot ?? ""),
          item.widthCmSnapshot ?? "",
          item.heightCmSnapshot ?? "",
          item.quantity,
          csvEscape(item.masterPrintImageUrlSnapshot ?? ""),
          csvEscape(order.trackingNumber ?? ""),
          csvEscape(order.fulfillmentStatus ?? "not_started"),
        ].join(","));
      }
    }
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="fulfillment-export.csv"`);
  return res.send(csvRows.join("\n"));
});

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;
