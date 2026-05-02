import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  postersTable,
  posterSizesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const TEST_SESSION_ID = "test-session-" + Date.now();
const TEST_STORE_KEY = "postsofspain";

export { TEST_SESSION_ID, TEST_STORE_KEY };

export async function cleanupTestOrders(email: string) {
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.customerEmail, email));
  for (const order of orders) {
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    await db.delete(ordersTable).where(eq(ordersTable.id, order.id));
  }
}

export async function cleanupTestCart(sessionId: string) {
  await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));
}

export async function getFirstPublishedPoster() {
  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.storeKey, TEST_STORE_KEY), eq(postersTable.status, "published")))
    .limit(1);
  return poster;
}

export async function getFirstActiveSizeForPoster(posterId: number) {
  const [size] = await db
    .select()
    .from(posterSizesTable)
    .where(and(eq(posterSizesTable.posterId, posterId), eq(posterSizesTable.active, true)))
    .limit(1);
  return size;
}

export async function addCartItem(
  sessionId: string,
  posterId: number,
  posterSizeId?: number,
  quantity = 1
) {
  const [size] = posterSizeId
    ? await db.select().from(posterSizesTable).where(eq(posterSizesTable.id, posterSizeId)).limit(1)
    : [undefined];

  await db.insert(cartItemsTable).values({
    sessionId,
    storeKey: TEST_STORE_KEY,
    posterId,
    posterSizeId: posterSizeId ?? null,
    quantity,
    size: size?.sizeLabel ?? null,
  });
}
