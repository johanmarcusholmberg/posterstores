import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, cartItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateOrderBody, GetOrderParams } from "@workspace/api-zod";

const router = Router();

function serializeOrder(o: typeof ordersTable.$inferSelect) {
  return {
    ...o,
    total: Number(o.total),
    createdAt: o.createdAt.toISOString(),
    items: o.items as unknown[],
  };
}

router.post("/orders", async (req, res) => {
  const body = CreateOrderBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { storeKey, sessionId, customerName, customerEmail, shippingAddress, items, total, currency } = body.data;

  const [order] = await db
    .insert(ordersTable)
    .values({
      storeKey,
      customerName: customerName ?? null,
      customerEmail,
      shippingAddress: shippingAddress ?? null,
      items: items as unknown as Record<string, unknown>[],
      total: String(total),
      currency,
      status: "confirmed",
    })
    .returning();

  if (sessionId) {
    await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));
  }

  return res.status(201).json(serializeOrder(order));
});

router.get("/orders/:id", async (req, res) => {
  const params = GetOrderParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) return res.status(404).json({ error: "Not found" });

  return res.json(serializeOrder(order));
});

export default router;
