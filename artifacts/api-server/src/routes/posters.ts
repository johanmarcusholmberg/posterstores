import { Router } from "express";
import { db } from "@workspace/db";
import { postersTable, posterSizesTable } from "@workspace/db";
import { eq, and, ilike, gte, lte, desc, asc, sql, inArray, ne } from "drizzle-orm";
import {
  ListPostersQueryParams,
  CreatePosterBody,
  UpdatePosterBody,
  GetPosterParams,
  UpdatePosterParams,
  DeletePosterParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { generateSlug } from "../lib/migrateSlugField";
import { isAdminRequest } from "../middleware/isAdminRequest";

const router = Router();

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function serializePosterSize(s: typeof posterSizesTable.$inferSelect) {
  return {
    ...s,
    price: Number(s.price),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function attachSizesToPosters(
  posters: (typeof postersTable.$inferSelect)[],
  adminRequest: boolean
) {
  if (posters.length === 0) return [];

  const ids = posters.map(p => p.id);
  const allSizes = ids.length > 0
    ? await db.select().from(posterSizesTable).where(inArray(posterSizesTable.posterId, ids)).orderBy(asc(posterSizesTable.sortOrder))
    : [];

  const sizeMap = new Map<number, (typeof allSizes[0])[]>();
  for (const s of allSizes) {
    const arr = sizeMap.get(s.posterId) ?? [];
    arr.push(s);
    sizeMap.set(s.posterId, arr);
  }

  return posters.map(p => {
    const rawSizes = sizeMap.get(p.id) ?? [];
    const posterSizes = adminRequest ? rawSizes : rawSizes.filter(s => s.active);
    const activePrices = rawSizes.filter(s => s.active).map(s => Number(s.price));
    const lowestActivePrice = activePrices.length > 0 ? Math.min(...activePrices) : null;

    return {
      ...p,
      price: Number(p.price),
      createdAt: p.createdAt.toISOString(),
      posterSizes: posterSizes.map(serializePosterSize),
      lowestActivePrice,
    };
  });
}

async function savePosterSizes(
  posterId: number,
  sizesInput: Array<{
    sizeLabel: string;
    price: number;
    currency: string;
    active?: boolean;
    sortOrder?: number;
  }>,
  defaultCurrency = "EUR"
) {
  await db.delete(posterSizesTable).where(eq(posterSizesTable.posterId, posterId));
  if (sizesInput.length > 0) {
    await db.insert(posterSizesTable).values(
      sizesInput.map((s, idx) => ({
        posterId,
        sizeLabel: s.sizeLabel,
        price: String(s.price),
        currency: s.currency ?? defaultCurrency,
        active: s.active ?? true,
        sortOrder: s.sortOrder ?? idx,
      }))
    );
  }
}

async function isSlugTaken(storeKey: string, slug: string, excludeId?: number): Promise<boolean> {
  const conditions = [
    eq(postersTable.storeKey, storeKey),
    eq(postersTable.slug, slug),
  ];
  if (excludeId !== undefined) {
    conditions.push(ne(postersTable.id, excludeId));
  }
  const rows = await db
    .select({ id: postersTable.id })
    .from(postersTable)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

async function resolveUniqueSlug(storeKey: string, baseSlug: string, excludeId?: number): Promise<string> {
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${baseSlug}-${attempt + 1}`;
    const taken = await isSlugTaken(storeKey, candidate, excludeId);
    if (!taken) return candidate;
    attempt++;
  }
}

router.get("/admin/poster-meta", requireAdmin, async (req, res) => {
  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const rows = await db
    .select({ category: postersTable.category, region: postersTable.region })
    .from(postersTable)
    .where(eq(postersTable.storeKey, storeKey));

  const categories = [...new Set(rows.map(r => r.category).filter((v): v is string => !!v))].sort();
  const regions = [...new Set(rows.map(r => r.region).filter((v): v is string => !!v))].sort();

  return res.json({ categories, regions });
});

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
    return res.status(401).json({ error: "Unauthorized: admin session required to view non-published posters" });
  }

  let conditions: ReturnType<typeof eq>[] = [];
  conditions.push(eq(postersTable.storeKey, storeKey));

  if (adminRequest && requestedStatus === "all") {
  } else if (adminRequest && requestedStatus) {
    conditions.push(eq(postersTable.status, requestedStatus));
  } else {
    conditions.push(eq(postersTable.status, "published"));
  }

  if (region) {
    const regionValues = region.split(",").map(v => v.trim()).filter(Boolean);
    if (regionValues.length === 1) conditions.push(eq(postersTable.region, regionValues[0]));
    else if (regionValues.length > 1) conditions.push(inArray(postersTable.region, regionValues));
  }
  if (city) conditions.push(eq(postersTable.city, city));
  if (category) {
    const categoryValues = category.split(",").map(v => v.trim()).filter(Boolean);
    if (categoryValues.length === 1) conditions.push(eq(postersTable.category, categoryValues[0]));
    else if (categoryValues.length > 1) conditions.push(inArray(postersTable.category, categoryValues));
  }
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

  let result = posters;
  if (tag) {
    result = posters.filter(p => p.tags?.includes(tag));
  }

  const withSizes = await attachSizesToPosters(result, adminRequest);

  if (tag) {
    return res.json({ posters: withSizes, total: withSizes.length, offset, limit });
  }

  return res.json({
    posters: withSizes,
    total: Number(countResult[0]?.count ?? 0),
    offset,
    limit,
  });
});

router.post("/posters", requireAdmin, async (req, res) => {
  const body = CreatePosterBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { price, posterSizes: posterSizesInput, slug: rawSlug, ...rest } = body.data;

  if (rawSlug !== undefined) {
    if (!SLUG_REGEX.test(rawSlug)) {
      return res.status(400).json({ error: "slug must be lowercase, URL-safe (letters, numbers, hyphens only), and cannot start or end with a hyphen" });
    }
    const taken = await isSlugTaken(rest.storeKey, rawSlug);
    if (taken) {
      return res.status(409).json({ error: "This slug is already in use in this store. Please choose a different slug." });
    }
  }

  const titleSlug = rest.title ? generateSlug(rest.title) : null;
  const slug = rawSlug ?? (titleSlug ? await resolveUniqueSlug(rest.storeKey, titleSlug) : null);

  const [poster] = await db
    .insert(postersTable)
    .values({ ...rest, price: String(price), slug })
    .returning();

  if (posterSizesInput && posterSizesInput.length > 0) {
    await savePosterSizes(poster.id, posterSizesInput as any, rest.currency ?? "EUR");
  }

  const [withSizes] = await attachSizesToPosters([poster], true);
  return res.status(201).json(withSizes);
});

router.get("/posters/by-slug/:slug", async (req, res) => {
  const slug = req.params.slug;
  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey query parameter is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(
      eq(postersTable.storeKey, storeKey),
      eq(postersTable.slug, slug),
      eq(postersTable.status, "published"),
    ))
    .limit(1);

  if (!poster) return res.status(404).json({ error: "Not found" });

  const [withSizes] = await attachSizesToPosters([poster], false);
  return res.json(withSizes);
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

  const [withSizes] = await attachSizesToPosters([poster], adminRequest);
  return res.json(withSizes);
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

  const { price, posterSizes: posterSizesInput, slug: rawSlug, ...rest } = body.data;

  if (rawSlug !== undefined) {
    if (!SLUG_REGEX.test(rawSlug)) {
      return res.status(400).json({ error: "slug must be lowercase, URL-safe (letters, numbers, hyphens only), and cannot start or end with a hyphen" });
    }
    const taken = await isSlugTaken(existing.storeKey, rawSlug, existing.id);
    if (taken) {
      return res.status(409).json({ error: "This slug is already in use in this store. Please choose a different slug." });
    }
  }

  const updateData: Record<string, unknown> = { ...rest };
  if (price !== undefined) updateData.price = String(price);
  if (rawSlug !== undefined) updateData.slug = rawSlug;

  if (Object.keys(updateData).length === 0 && posterSizesInput === undefined) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const [poster] = await db
    .update(postersTable)
    .set(updateData as Partial<typeof postersTable.$inferInsert>)
    .where(eq(postersTable.id, params.data.id))
    .returning();

  if (posterSizesInput !== undefined) {
    await savePosterSizes(poster.id, posterSizesInput as any, poster.currency ?? "EUR");
  }

  const [withSizes] = await attachSizesToPosters([poster], true);
  return res.json(withSizes);
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

export default router;
