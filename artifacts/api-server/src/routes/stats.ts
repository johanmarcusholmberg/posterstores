import { Router } from "express";
import { db } from "@workspace/db";
import { postersTable, ordersTable } from "@workspace/db";
import { eq, and, desc, sql, notInArray } from "drizzle-orm";
import {
  GetStoreStatsQueryParams,
  GetFeaturedPostersQueryParams,
  GetNewArrivalsQueryParams,
} from "@workspace/api-zod";
import { enrichPosters } from "../lib/posterEnrichment";

const router = Router();

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
  const limit = query.data.limit ?? 12;

  const featuredPosters = await db
    .select()
    .from(postersTable)
    .where(
      and(
        eq(postersTable.isFeatured, true),
        eq(postersTable.storeKey, storeKey),
        eq(postersTable.status, "published")
      )
    )
    .orderBy(desc(postersTable.createdAt))
    .limit(limit);

  let combined = featuredPosters;

  if (combined.length < limit) {
    const featuredIds = combined.map(p => p.id);
    const remaining = limit - combined.length;

    const fallbackConditions = [
      eq(postersTable.storeKey, storeKey),
      eq(postersTable.status, "published"),
    ];
    if (featuredIds.length > 0) {
      fallbackConditions.push(notInArray(postersTable.id, featuredIds));
    }

    const fallback = await db
      .select()
      .from(postersTable)
      .where(and(...fallbackConditions))
      .orderBy(desc(postersTable.createdAt))
      .limit(remaining);

    combined = [...featuredPosters, ...fallback];
  }

  const enriched = await enrichPosters(combined, false);
  return res.json(enriched);
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

  const enriched = await enrichPosters(posters, false);
  return res.json(enriched);
});

export default router;
