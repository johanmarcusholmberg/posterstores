import { Router } from "express";
import { db } from "@workspace/db";
import { cartItemsTable, postersTable, posterSizesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetCartQueryParams,
  AddCartItemBody,
  UpdateCartItemParams,
  UpdateCartItemBody,
  RemoveCartItemParams,
} from "@workspace/api-zod";

const router = Router();

function serializePosterSize(s: typeof posterSizesTable.$inferSelect) {
  return {
    ...s,
    price: Number(s.price),
    widthCm: s.widthCm != null ? Number(s.widthCm) : null,
    heightCm: s.heightCm != null ? Number(s.heightCm) : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function getCartForSession(sessionId: string, storeKey: string) {
  const items = await db
    .select()
    .from(cartItemsTable)
    .leftJoin(postersTable, eq(cartItemsTable.posterId, postersTable.id))
    .where(and(
      eq(cartItemsTable.sessionId, sessionId),
      eq(cartItemsTable.storeKey, storeKey),
    ));

  const posterSizeIds = items
    .map(row => row.cart_items.posterSizeId)
    .filter((id): id is number => id != null);

  const sizeMap = new Map<number, typeof posterSizesTable.$inferSelect>();
  if (posterSizeIds.length > 0) {
    for (const sizeId of posterSizeIds) {
      const [size] = await db.select().from(posterSizesTable).where(eq(posterSizesTable.id, sizeId));
      if (size) sizeMap.set(size.id, size);
    }
  }

  const cartItems = items.map(row => {
    const posterSize = row.cart_items.posterSizeId != null
      ? sizeMap.get(row.cart_items.posterSizeId)
      : undefined;

    const unitPrice = posterSize
      ? Number(posterSize.price)
      : (row.posters ? Number(row.posters.price) : 0);

    const currency = posterSize
      ? posterSize.currency
      : (row.posters?.currency ?? "EUR");

    return {
      id: row.cart_items.id,
      posterId: row.cart_items.posterId,
      posterSizeId: row.cart_items.posterSizeId ?? null,
      quantity: row.cart_items.quantity,
      size: posterSize ? posterSize.sizeLabel : (row.cart_items.size ?? null),
      unitPrice,
      currency,
      posterSize: posterSize ? serializePosterSize(posterSize) : undefined,
      poster: row.posters ? {
        ...row.posters,
        price: Number(row.posters.price),
        createdAt: row.posters.createdAt.toISOString(),
      } : undefined,
    };
  });

  const total = cartItems.reduce((sum, item) => {
    return sum + item.unitPrice * item.quantity;
  }, 0);

  const currency = cartItems[0]?.currency ?? "EUR";

  return {
    sessionId,
    storeKey,
    items: cartItems,
    total: Math.round(total * 100) / 100,
    itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    currency,
  };
}

router.get("/cart", async (req, res) => {
  const query = GetCartQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });

  const cart = await getCartForSession(query.data.sessionId, query.data.storeKey);
  return res.json(cart);
});

router.post("/cart/items", async (req, res) => {
  const body = AddCartItemBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { sessionId, storeKey, posterId, quantity, size, posterSizeId } = body.data as any;

  const existingItems = await db
    .select()
    .from(cartItemsTable)
    .where(and(
      eq(cartItemsTable.sessionId, sessionId),
      eq(cartItemsTable.storeKey, storeKey),
      eq(cartItemsTable.posterId, posterId),
    ));

  const sizeIdToUse = posterSizeId ?? null;

  const matchingItem = existingItems.find(item =>
    (sizeIdToUse != null ? item.posterSizeId === sizeIdToUse : item.posterSizeId == null) &&
    (size ? item.size === size : true)
  );

  if (matchingItem) {
    await db
      .update(cartItemsTable)
      .set({ quantity: matchingItem.quantity + quantity })
      .where(eq(cartItemsTable.id, matchingItem.id));
  } else {
    let sizeLabel = size ?? null;
    if (sizeIdToUse && !sizeLabel) {
      const [sizeRow] = await db.select().from(posterSizesTable).where(eq(posterSizesTable.id, sizeIdToUse));
      if (sizeRow) sizeLabel = sizeRow.sizeLabel;
    }
    await db.insert(cartItemsTable).values({
      sessionId,
      storeKey,
      posterId,
      posterSizeId: sizeIdToUse,
      quantity,
      size: sizeLabel,
    });
  }

  const cart = await getCartForSession(sessionId, storeKey);
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

  const cart = await getCartForSession(item.sessionId, item.storeKey);
  return res.json(cart);
});

router.delete("/cart/items/:cartItemId", async (req, res) => {
  const params = RemoveCartItemParams.safeParse({ cartItemId: Number(req.params.cartItemId) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const [item] = await db.select().from(cartItemsTable).where(eq(cartItemsTable.id, params.data.cartItemId));
  if (!item) return res.status(404).json({ error: "Not found" });

  await db.delete(cartItemsTable).where(eq(cartItemsTable.id, params.data.cartItemId));

  const cart = await getCartForSession(item.sessionId, item.storeKey);
  return res.json(cart);
});

export default router;
