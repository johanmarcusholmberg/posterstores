import request from "supertest";
import app from "../app";
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

/**
 * Login with the ADMIN_API_TOKEN and return the Set-Cookie header value
 * so tests can attach it with `.set("Cookie", adminCookie)`.
 */
export async function getAdminCookie(): Promise<string> {
  const token = process.env.ADMIN_API_TOKEN ?? "test-admin-token";
  const res = await request(app)
    .post("/api/admin/login")
    .send({ token })
    .set("Content-Type", "application/json");
  if (res.status !== 200) {
    throw new Error(`Admin login failed in test setup: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookie = res.headers["set-cookie"];
  if (!cookie) throw new Error("No Set-Cookie header in admin login response");
  return Array.isArray(cookie) ? cookie[0] : cookie;
}

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
