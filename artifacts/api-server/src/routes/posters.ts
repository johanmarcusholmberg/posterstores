import { Router } from "express";
import { db } from "@workspace/db";
import { postersTable, insertPosterSchema } from "@workspace/db";
import { eq, and, ilike, gte, lte, desc, asc, sql } from "drizzle-orm";
import {
  ListPostersQueryParams,
  CreatePosterBody,
  UpdatePosterBody,
  GetPosterParams,
  UpdatePosterParams,
  DeletePosterParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

function isAdminRequest(req: import("express").Request): boolean {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) return false;
  return req.headers["x-admin-token"] === token;
}

router.get("/posters", async (req, res) => {
  const query = ListPostersQueryParams.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }
  const { storeKey, region, city, category, tag, search, minPrice, maxPrice, sort, limit = 24, offset = 0 } = query.data;

  if (!storeKey) {
    return res.status(400).json({ error: "storeKey query parameter is required" });
  }

  const requestedStatus = typeof req.query.status === "string" ? req.query.status : undefined;
  const adminRequest = isAdminRequest(req);

  if (requestedStatus && requestedStatus !== "published" && !adminRequest) {
    return res.status(401).json({ error: "Unauthorized: admin token required to view non-published posters" });
  }

  let conditions: ReturnType<typeof eq>[] = [];
  conditions.push(eq(postersTable.storeKey, storeKey));

  if (adminRequest && requestedStatus === "all") {
  } else if (adminRequest && requestedStatus) {
    conditions.push(eq(postersTable.status, requestedStatus));
  } else {
    conditions.push(eq(postersTable.status, "published"));
  }

  if (region) conditions.push(eq(postersTable.region, region));
  if (city) conditions.push(eq(postersTable.city, city));
  if (category) conditions.push(eq(postersTable.category, category));
  if (search) conditions.push(ilike(postersTable.title, `%${search}%`));
  if (minPrice !== undefined) conditions.push(gte(postersTable.price, String(minPrice)));
  if (maxPrice !== undefined) conditions.push(lte(postersTable.price, String(maxPrice)));

  let orderBy;
  switch (sort) {
    case "price_asc": orderBy = asc(postersTable.price); break;
    case "price_desc": orderBy = desc(postersTable.price); break;
    case "popular": orderBy = desc(postersTable.isFeatured); break;
    default: orderBy = desc(postersTable.createdAt);
  }

  const whereClause = and(...conditions);

  const [posters, countResult] = await Promise.all([
    db.select().from(postersTable).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(postersTable).where(whereClause),
  ]);

  if (tag) {
    const filtered = posters.filter(p => p.tags?.includes(tag));
    return res.json({ posters: filtered.map(serializePoster), total: filtered.length, offset, limit });
  }

  return res.json({
    posters: posters.map(serializePoster),
    total: Number(countResult[0]?.count ?? 0),
    offset,
    limit,
  });
});

router.post("/posters", requireAdmin, async (req, res) => {
  const body = CreatePosterBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { price, ...rest } = body.data;
  const [poster] = await db
    .insert(postersTable)
    .values({ ...rest, price: String(price) })
    .returning();
  return res.status(201).json(serializePoster(poster));
});

router.get("/posters/:id", async (req, res) => {
  const params = GetPosterParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey query parameter is required" });

  const adminRequest = isAdminRequest(req);

  const conditions = [
    eq(postersTable.id, params.data.id),
    eq(postersTable.storeKey, storeKey),
  ];
  if (!adminRequest) {
    conditions.push(eq(postersTable.status, "published"));
  }

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(...conditions));

  if (!poster) return res.status(404).json({ error: "Not found" });
  return res.json(serializePoster(poster));
});

router.put("/posters/:id", requireAdmin, async (req, res) => {
  const params = UpdatePosterParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = UpdatePosterBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const [existing] = await db.select().from(postersTable).where(eq(postersTable.id, params.data.id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const requestedStoreKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (requestedStoreKey && requestedStoreKey !== existing.storeKey) {
    return res.status(403).json({ error: "storeKey mismatch: cannot edit poster from another store" });
  }

  const { price, ...rest } = body.data;
  const updateData = price !== undefined
    ? { ...rest, price: String(price) }
    : rest;

  const [poster] = await db
    .update(postersTable)
    .set(updateData as Partial<typeof postersTable.$inferInsert>)
    .where(eq(postersTable.id, params.data.id))
    .returning();

  return res.json(serializePoster(poster));
});

router.delete("/posters/:id", requireAdmin, async (req, res) => {
  const params = DeletePosterParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db.select().from(postersTable).where(eq(postersTable.id, params.data.id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const requestedStoreKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (requestedStoreKey && requestedStoreKey !== existing.storeKey) {
    return res.status(403).json({ error: "storeKey mismatch: cannot delete poster from another store" });
  }

  await db.delete(postersTable).where(eq(postersTable.id, params.data.id));
  return res.status(204).send();
});

function serializePoster(p: typeof postersTable.$inferSelect) {
  return {
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
  };
}

export default router;
