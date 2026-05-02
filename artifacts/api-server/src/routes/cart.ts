import { Router } from "express";
import { db } from "@workspace/db";
import { cartItemsTable, postersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetCartQueryParams,
  AddCartItemBody,
  UpdateCartItemParams,
  UpdateCartItemBody,
  RemoveCartItemParams,
} from "@workspace/api-zod";

const router = Router();

async function getCartForSession(sessionId: string) {
  const items = await db
    .select()
    .from(cartItemsTable)
    .leftJoin(postersTable, eq(cartItemsTable.posterId, postersTable.id))
    .where(eq(cartItemsTable.sessionId, sessionId));

  const cartItems = items.map(row => ({
    id: row.cart_items.id,
    posterId: row.cart_items.posterId,
    quantity: row.cart_items.quantity,
    size: row.cart_items.size,
    poster: row.posters ? {
      ...row.posters,
      price: Number(row.posters.price),
      createdAt: row.posters.createdAt.toISOString(),
    } : undefined,
  }));

  const total = cartItems.reduce((sum, item) => {
    return sum + (item.poster?.price ?? 0) * item.quantity;
  }, 0);

  return {
    sessionId,
    items: cartItems,
    total: Math.round(total * 100) / 100,
    itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
  };
}

router.get("/cart", async (req, res) => {
  const query = GetCartQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });

  const cart = await getCartForSession(query.data.sessionId);
  return res.json(cart);
});

router.post("/cart/items", async (req, res) => {
  const body = AddCartItemBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { sessionId, posterId, quantity, size } = body.data;

  const existing = await db
    .select()
    .from(cartItemsTable)
    .where(and(
      eq(cartItemsTable.sessionId, sessionId),
      eq(cartItemsTable.posterId, posterId),
    ));

  if (existing.length > 0) {
    await db
      .update(cartItemsTable)
      .set({ quantity: existing[0].quantity + quantity })
      .where(eq(cartItemsTable.id, existing[0].id));
  } else {
    await db.insert(cartItemsTable).values({ sessionId, posterId, quantity, size: size ?? null });
  }

  const cart = await getCartForSession(sessionId);
  return res.json(cart);
});

router.put("/cart/items/:cartItemId", async (req, res) => {
  const params = UpdateCartItemParams.safeParse({ cartItemId: Number(req.params.cartItemId) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = UpdateCartItemBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const [item] = await db
    .update(cartItemsTable)
    .set({ quantity: body.data.quantity })
    .where(eq(cartItemsTable.id, params.data.cartItemId))
    .returning();

  if (!item) return res.status(404).json({ error: "Not found" });

  const cart = await getCartForSession(item.sessionId);
  return res.json(cart);
});

router.delete("/cart/items/:cartItemId", async (req, res) => {
  const params = RemoveCartItemParams.safeParse({ cartItemId: Number(req.params.cartItemId) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const [item] = await db.select().from(cartItemsTable).where(eq(cartItemsTable.id, params.data.cartItemId));
  if (!item) return res.status(404).json({ error: "Not found" });

  await db.delete(cartItemsTable).where(eq(cartItemsTable.id, params.data.cartItemId));

  const cart = await getCartForSession(item.sessionId);
  return res.json(cart);
});

export default router;
