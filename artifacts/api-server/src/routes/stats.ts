import { Router } from "express";
import { db } from "@workspace/db";
import { postersTable, ordersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  GetStoreStatsQueryParams,
  GetFeaturedPostersQueryParams,
  GetNewArrivalsQueryParams,
} from "@workspace/api-zod";

const router = Router();

function serializePoster(p: typeof postersTable.$inferSelect) {
  return {
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/stats/store", async (req, res) => {
  const query = GetStoreStatsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });

  const storeKey = query.data.storeKey ?? "postsofspain";

  const [posterCount, orderCount, categoryCounts, featuredCount, newCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(postersTable)
      .where(eq(postersTable.storeKey, storeKey)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(ordersTable)
      .where(eq(ordersTable.storeKey, storeKey)),
    db
      .select({ category: postersTable.category, count: sql<number>`count(*)` })
      .from(postersTable)
      .where(eq(postersTable.storeKey, storeKey))
      .groupBy(postersTable.category)
      .orderBy(desc(sql<number>`count(*)`))
      .limit(5),
    db
      .select({ count: sql<number>`count(*)` })
      .from(postersTable)
      .where(and(eq(postersTable.isFeatured, true), eq(postersTable.storeKey, storeKey))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(postersTable)
      .where(and(eq(postersTable.isNew, true), eq(postersTable.storeKey, storeKey))),
  ]);

  return res.json({
    totalPosters: Number(posterCount[0]?.count ?? 0),
    totalOrders: Number(orderCount[0]?.count ?? 0),
    topCategories: categoryCounts.map(c => ({ category: c.category, count: Number(c.count) })),
    featuredCount: Number(featuredCount[0]?.count ?? 0),
    newArrivalsCount: Number(newCount[0]?.count ?? 0),
  });
});

router.get("/stats/featured", async (req, res) => {
  const query = GetFeaturedPostersQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });

  const storeKey = query.data.storeKey ?? "postsofspain";
  const limit = query.data.limit ?? 8;

  const posters = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.isFeatured, true), eq(postersTable.storeKey, storeKey)))
    .orderBy(desc(postersTable.createdAt))
    .limit(limit);

  return res.json(posters.map(serializePoster));
});

router.get("/stats/new-arrivals", async (req, res) => {
  const query = GetNewArrivalsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });

  const storeKey = query.data.storeKey ?? "postsofspain";
  const limit = query.data.limit ?? 8;

  const posters = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.isNew, true), eq(postersTable.storeKey, storeKey)))
    .orderBy(desc(postersTable.createdAt))
    .limit(limit);

  return res.json(posters.map(serializePoster));
});

export default router;
