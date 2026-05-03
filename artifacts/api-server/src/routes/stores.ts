import { Router } from "express";
import { db } from "@workspace/db";
import { storesTable, postersTable, ordersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { z } from "zod";

const router = Router();

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const STORE_KEY_RE = /^[a-z][a-z0-9]*$/;

const themeConfigSchema = z
  .object({
    background: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color"),
    surface: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color"),
    sand: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color"),
    primary: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color"),
    secondary: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color"),
    text: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color"),
    muted: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color"),
    border: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color"),
  })
  .nullable()
  .optional();

const homepageConfigSchema = z
  .object({
    heroTitle: z.string().optional(),
    heroSubtitle: z.string().optional(),
    primaryCta: z.string().optional(),
    secondaryCta: z.string().optional(),
    newsletterTitle: z.string().optional(),
    newsletterSubtitle: z.string().optional(),
    regions: z.array(z.string()).optional(),
    cities: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .nullable()
  .optional();

const seoConfigSchema = z
  .object({
    defaultTitle: z.string().optional(),
    defaultDescription: z.string().optional(),
  })
  .nullable()
  .optional();

const createStoreSchema = z.object({
  storeKey: z
    .string()
    .min(1, "Store key is required")
    .regex(STORE_KEY_RE, "Store key must be lowercase letters and numbers only, starting with a letter"),
  name: z.string().min(1, "Store name is required"),
  countryFocus: z.string().min(1, "Country focus is required"),
  defaultCurrency: z.string().min(1, "Currency is required"),
  defaultLanguage: z.string().min(1, "Language is required").default("en"),
  active: z.boolean().default(true),
  themeConfig: themeConfigSchema,
  homepageConfig: homepageConfigSchema,
  seoConfig: seoConfigSchema,
  navigationConfig: z.any().nullable().optional(),
});

const updateStoreSchema = createStoreSchema
  .omit({ storeKey: true })
  .partial()
  .extend({
    active: z.boolean().optional(),
  });

function serializeStore(
  store: typeof storesTable.$inferSelect,
  posterCount = 0,
  orderCount = 0
) {
  return {
    ...store,
    posterCount,
    orderCount,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

// GET /api/admin/stores — list all stores with counts
router.get("/admin/stores", requireAdmin, async (req, res) => {
  const stores = await db.select().from(storesTable).orderBy(storesTable.createdAt);

  const storeKeys = stores.map((s) => s.storeKey);

  const posterCounts =
    storeKeys.length > 0
      ? await db
          .select({ storeKey: postersTable.storeKey, count: sql<number>`count(*)` })
          .from(postersTable)
          .groupBy(postersTable.storeKey)
      : [];

  const orderCounts =
    storeKeys.length > 0
      ? await db
          .select({ storeKey: ordersTable.storeKey, count: sql<number>`count(*)` })
          .from(ordersTable)
          .groupBy(ordersTable.storeKey)
      : [];

  const pMap = new Map(posterCounts.map((r) => [r.storeKey, Number(r.count)]));
  const oMap = new Map(orderCounts.map((r) => [r.storeKey, Number(r.count)]));

  return res.json(stores.map((s) => serializeStore(s, pMap.get(s.storeKey) ?? 0, oMap.get(s.storeKey) ?? 0)));
});

// POST /api/admin/stores — create a new store
router.post("/admin/stores", requireAdmin, async (req, res) => {
  const parsed = createStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { storeKey } = parsed.data;

  const existing = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (existing.length > 0) {
    return res.status(409).json({ error: `Store key "${storeKey}" already exists` });
  }

  const now = new Date();
  const [created] = await db
    .insert(storesTable)
    .values({
      storeKey: parsed.data.storeKey,
      name: parsed.data.name,
      countryFocus: parsed.data.countryFocus,
      defaultCurrency: parsed.data.defaultCurrency,
      defaultLanguage: parsed.data.defaultLanguage ?? "en",
      active: parsed.data.active ?? true,
      themeConfig: parsed.data.themeConfig ?? null,
      homepageConfig: parsed.data.homepageConfig ?? null,
      seoConfig: parsed.data.seoConfig ?? null,
      navigationConfig: parsed.data.navigationConfig ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return res.status(201).json(serializeStore(created));
});

// GET /api/admin/stores/:storeKey — get single store
router.get("/admin/stores/:storeKey", requireAdmin, async (req, res) => {
  const storeKey = String(req.params.storeKey);
  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  const [posterCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(postersTable)
    .where(eq(postersTable.storeKey, storeKey));

  const [orderCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(eq(ordersTable.storeKey, storeKey));

  return res.json(
    serializeStore(store, Number(posterCountRow?.count ?? 0), Number(orderCountRow?.count ?? 0))
  );
});

// PUT /api/admin/stores/:storeKey — update store
router.put("/admin/stores/:storeKey", requireAdmin, async (req, res) => {
  const storeKey = String(req.params.storeKey);

  const [existing] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (!existing) {
    return res.status(404).json({ error: "Store not found" });
  }

  const parsed = updateStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updates: Partial<typeof storesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.countryFocus !== undefined) updates.countryFocus = parsed.data.countryFocus;
  if (parsed.data.defaultCurrency !== undefined) updates.defaultCurrency = parsed.data.defaultCurrency;
  if (parsed.data.defaultLanguage !== undefined) updates.defaultLanguage = parsed.data.defaultLanguage;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  if ("themeConfig" in parsed.data) updates.themeConfig = parsed.data.themeConfig ?? null;
  if ("homepageConfig" in parsed.data) updates.homepageConfig = parsed.data.homepageConfig ?? null;
  if ("seoConfig" in parsed.data) updates.seoConfig = parsed.data.seoConfig ?? null;
  if ("navigationConfig" in parsed.data) updates.navigationConfig = parsed.data.navigationConfig ?? null;

  const [updated] = await db
    .update(storesTable)
    .set(updates)
    .where(eq(storesTable.storeKey, storeKey))
    .returning();

  return res.json(serializeStore(updated));
});

// PATCH /api/admin/stores/:storeKey/deactivate — deactivate (archive) a store
router.patch("/admin/stores/:storeKey/deactivate", requireAdmin, async (req, res) => {
  const storeKey = String(req.params.storeKey);

  const [existing] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (!existing) {
    return res.status(404).json({ error: "Store not found" });
  }

  // Prevent deactivating a store that has posters or orders
  const [posterCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(postersTable)
    .where(eq(postersTable.storeKey, storeKey));

  const [orderCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(eq(ordersTable.storeKey, storeKey));

  const posterCount = Number(posterCountRow?.count ?? 0);
  const orderCount = Number(orderCountRow?.count ?? 0);

  if (posterCount > 0 || orderCount > 0) {
    return res.status(409).json({
      error: `Cannot deactivate a store with ${posterCount} poster(s) and ${orderCount} order(s). Move or delete them first, or set active=false via the edit form instead.`,
    });
  }

  const [updated] = await db
    .update(storesTable)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(storesTable.storeKey, storeKey))
    .returning();

  return res.json(serializeStore(updated));
});

// GET /api/stores — public endpoint: returns active store configs (for store selector)
router.get("/stores", async (_req, res) => {
  const stores = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.active, true))
    .orderBy(storesTable.createdAt);

  return res.json(stores.map((s) => serializeStore(s)));
});

// GET /api/stores/:storeKey/config — public endpoint: merged config for a single store
router.get("/stores/:storeKey/config", async (req, res) => {
  const storeKey = String(req.params.storeKey);

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (!store) {
    return res.status(404).json({ error: "Store not found in database" });
  }

  const homepage = (store.homepageConfig ?? {}) as Record<string, unknown>;
  const theme = store.themeConfig as Record<string, string> | null;
  const seo = store.seoConfig as Record<string, string> | null;

  return res.json({
    storeKey: store.storeKey,
    storeName: store.name,
    countryFocus: store.countryFocus,
    defaultCurrency: store.defaultCurrency,
    defaultLanguage: store.defaultLanguage,
    active: store.active,
    theme: theme ?? undefined,
    homepage: {
      heroTitle: (homepage.heroTitle as string) ?? "",
      heroSubtitle: (homepage.heroSubtitle as string) ?? "",
      primaryCta: (homepage.primaryCta as string) ?? undefined,
      secondaryCta: (homepage.secondaryCta as string) ?? undefined,
      newsletterTitle: (homepage.newsletterTitle as string) ?? undefined,
      newsletterSubtitle: (homepage.newsletterSubtitle as string) ?? undefined,
    },
    regions: (homepage.regions as string[]) ?? [],
    cities: (homepage.cities as string[]) ?? [],
    categories: (homepage.categories as string[]) ?? undefined,
    tags: (homepage.tags as string[]) ?? undefined,
    seo: seo
      ? { defaultTitle: seo.defaultTitle ?? "", defaultDescription: seo.defaultDescription ?? "" }
      : undefined,
  });
});

export default router;
