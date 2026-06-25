import { Router } from "express";
import { db } from "@workspace/db";
import { storesTable, postersTable, ordersTable } from "@workspace/db";
import { eq, sql, and, ne } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import multer from "multer";

const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPEG, or WebP images are allowed for store logos"));
    }
  },
});

const objectStorageService = new ObjectStorageService();

const router = Router();

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const STORE_KEY_RE = /^[a-z][a-z0-9]*$/;
const ROUTE_PREFIX_RE = /^[a-z][a-z0-9-]*$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

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

const ALLOWED_FONTS = [
  "System default",
  "Playfair Display",
  "Cormorant Garamond",
  "Lora",
  "Libre Baskerville",
  "Merriweather",
  "Inter",
  "DM Sans",
  "Source Sans 3",
  "Manrope",
] as const;

const optionalHex = z.string().regex(HEX_COLOR_RE, "Must be a valid hex color").optional();

const typographyConfigSchema = z
  .object({
    logoFont: z.enum(ALLOWED_FONTS).optional(),
    headingFont: z.enum(ALLOWED_FONTS).optional(),
    bodyFont: z.enum(ALLOWED_FONTS).optional(),
    headingColor: optionalHex,
    linkColor: optionalHex,
    buttonTextColor: optionalHex,
    heroTextMode: z.enum(["dark", "light", "custom"]).optional(),
    heroEyebrowColor: optionalHex,
    heroHeadingColor: optionalHex,
    heroSubtitleColor: optionalHex,
    heroBulletColor: optionalHex,
    heroOverlayMode: z.enum(["none", "light", "dark", "custom"]).optional(),
    heroOverlayOpacity: z.number().min(0).max(1).optional(),
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

const domainRoutingSchema = z.object({
  primaryDomain: z
    .string()
    .regex(DOMAIN_RE, "Must be a valid domain (e.g. postsofspain.com)")
    .nullable()
    .optional(),
  domainAliases: z
    .array(z.string().regex(DOMAIN_RE, "Each alias must be a valid domain"))
    .nullable()
    .optional(),
  routePrefix: z
    .string()
    .regex(ROUTE_PREFIX_RE, "Route prefix must be lowercase letters, numbers, or hyphens, starting with a letter")
    .nullable()
    .optional(),
});

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
  typographyConfig: typographyConfigSchema,
  homepageConfig: homepageConfigSchema,
  seoConfig: seoConfigSchema,
  navigationConfig: z.any().nullable().optional(),
  posterCardPresentation: z.enum(["current", "full-image", "stage"]).nullable().optional(),
  productCardBgColor: z.string().regex(HEX_COLOR_RE, "Must be a valid hex color").nullable().optional(),
  ...domainRoutingSchema.shape,
});

const updateStoreSchema = createStoreSchema
  .omit({ storeKey: true })
  .partial()
  .extend({
    active: z.boolean().optional(),
    ...domainRoutingSchema.shape,
    logoAltText: z.string().nullable().optional(),
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
    domainAliases: (store.domainAliases as string[] | null) ?? null,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

/** Collect all domains in use by other stores (for uniqueness checks). */
async function checkDomainAndPrefixUniqueness(
  routePrefix: string | null | undefined,
  primaryDomain: string | null | undefined,
  domainAliases: string[] | null | undefined,
  excludeStoreKey?: string
): Promise<string | null> {
  if (!routePrefix && !primaryDomain && (!domainAliases || domainAliases.length === 0)) {
    return null;
  }

  const allStores = await db.select().from(storesTable);
  const others = excludeStoreKey
    ? allStores.filter((s) => s.storeKey !== excludeStoreKey)
    : allStores;

  if (routePrefix) {
    const conflict = others.find((s) => s.routePrefix === routePrefix);
    if (conflict) {
      return `Route prefix "${routePrefix}" is already used by store "${conflict.storeKey}"`;
    }
  }

  if (primaryDomain) {
    const allOtherDomains = others.flatMap((s) => [
      s.primaryDomain,
      ...((s.domainAliases as string[] | null) ?? []),
    ]).filter(Boolean) as string[];
    if (allOtherDomains.includes(primaryDomain)) {
      return `Domain "${primaryDomain}" is already used by another store`;
    }
  }

  if (domainAliases && domainAliases.length > 0) {
    const allOtherDomains = others.flatMap((s) => [
      s.primaryDomain,
      ...((s.domainAliases as string[] | null) ?? []),
    ]).filter(Boolean) as string[];
    for (const alias of domainAliases) {
      if (allOtherDomains.includes(alias)) {
        return `Domain alias "${alias}" is already used by another store`;
      }
    }
  }

  return null;
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

  const { storeKey, routePrefix, primaryDomain, domainAliases } = parsed.data;

  const existing = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (existing.length > 0) {
    return res.status(409).json({ error: `Store key "${storeKey}" already exists` });
  }

  const uniquenessError = await checkDomainAndPrefixUniqueness(
    routePrefix,
    primaryDomain,
    domainAliases as string[] | null | undefined
  );
  if (uniquenessError) {
    return res.status(409).json({ error: uniquenessError });
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
      typographyConfig: parsed.data.typographyConfig ?? null,
      homepageConfig: parsed.data.homepageConfig ?? null,
      seoConfig: parsed.data.seoConfig ?? null,
      navigationConfig: parsed.data.navigationConfig ?? null,
      primaryDomain: parsed.data.primaryDomain ?? null,
      domainAliases: (parsed.data.domainAliases as string[] | null | undefined) ?? null,
      routePrefix: parsed.data.routePrefix ?? null,
      posterCardPresentation: (parsed.data.posterCardPresentation as "current" | "full-image" | "stage" | null | undefined) ?? null,
      productCardBgColor: parsed.data.productCardBgColor ?? null,
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

  const { routePrefix, primaryDomain, domainAliases } = parsed.data;

  const uniquenessError = await checkDomainAndPrefixUniqueness(
    routePrefix,
    primaryDomain,
    domainAliases as string[] | null | undefined,
    storeKey
  );
  if (uniquenessError) {
    return res.status(409).json({ error: uniquenessError });
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
  if ("typographyConfig" in parsed.data) updates.typographyConfig = parsed.data.typographyConfig ?? null;
  if ("homepageConfig" in parsed.data) updates.homepageConfig = parsed.data.homepageConfig ?? null;
  if ("seoConfig" in parsed.data) updates.seoConfig = parsed.data.seoConfig ?? null;
  if ("navigationConfig" in parsed.data) updates.navigationConfig = parsed.data.navigationConfig ?? null;
  if ("primaryDomain" in parsed.data) updates.primaryDomain = parsed.data.primaryDomain ?? null;
  if ("domainAliases" in parsed.data) updates.domainAliases = (parsed.data.domainAliases as string[] | null | undefined) ?? null;
  if ("routePrefix" in parsed.data) updates.routePrefix = parsed.data.routePrefix ?? null;
  if ("logoAltText" in parsed.data) updates.logoAltText = parsed.data.logoAltText ?? null;
  if ("posterCardPresentation" in parsed.data) updates.posterCardPresentation = (parsed.data.posterCardPresentation as "current" | "full-image" | "stage" | null | undefined) ?? null;
  if ("productCardBgColor" in parsed.data) updates.productCardBgColor = parsed.data.productCardBgColor ?? null;

  const [updated] = await db
    .update(storesTable)
    .set(updates)
    .where(eq(storesTable.storeKey, storeKey))
    .returning();

  return res.json(serializeStore(updated));
});

// POST /api/admin/stores/:storeKey/logo — multipart file upload; validates MIME+size server-side
router.post(
  "/admin/stores/:storeKey/logo",
  requireAdmin,
  (req, res, next) => {
    logoUpload.single("logo")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "Logo must be under 2 MB" });
          return;
        }
        res.status(400).json({ error: (err as Error).message ?? "File upload error" });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const storeKey = String(req.params.storeKey);

    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.storeKey, storeKey))
      .limit(1);

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "A logo file is required (field name: logo)" });
    }

    // Double-check MIME type (fileFilter already checked, but belt-and-suspenders)
    if (!ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ error: "Only PNG, JPEG, or WebP images are allowed" });
    }

    // Build a deterministic, sanitized storage path
    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const sanitizedName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80);
    const subPath = `store-assets/${storeKey}/logo/${Date.now()}-${sanitizedName}.${ext}`;

    // Delete previous logo from storage if there is one
    if (store.logoStoragePath) {
      try {
        const oldFile = await objectStorageService.getObjectEntityFile(store.logoStoragePath);
        await oldFile.delete();
      } catch (err) {
        req.log.warn({ err }, "Failed to delete previous store logo from storage, continuing");
      }
    }

    let objectPath: string;
    try {
      objectPath = await objectStorageService.uploadBuffer(subPath, file.buffer, file.mimetype);
    } catch (err) {
      req.log.error({ err }, "Failed to upload store logo to object storage");
      return res.status(500).json({ error: "Failed to upload logo to storage" });
    }

    const logoUrl = `/api/storage${objectPath}`;
    const logoAltText = typeof req.body.logoAltText === "string" ? req.body.logoAltText || null : store.logoAltText;

    const [updated] = await db
      .update(storesTable)
      .set({ logoUrl, logoStoragePath: objectPath, logoAltText, updatedAt: new Date() })
      .where(eq(storesTable.storeKey, storeKey))
      .returning();

    return res.json({ logoUrl: updated.logoUrl, logoStoragePath: updated.logoStoragePath, logoAltText: updated.logoAltText });
  }
);

// DELETE /api/admin/stores/:storeKey/logo — remove store logo
router.delete("/admin/stores/:storeKey/logo", requireAdmin, async (req, res) => {
  const storeKey = String(req.params.storeKey);

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  if (store.logoStoragePath) {
    try {
      const file = await objectStorageService.getObjectEntityFile(store.logoStoragePath);
      await file.delete();
    } catch (err) {
      req.log.warn({ err }, "Failed to delete store logo from storage, continuing");
    }
  }

  const [updated] = await db
    .update(storesTable)
    .set({ logoUrl: null, logoStoragePath: null, logoAltText: null, updatedAt: new Date() })
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

// ── In-memory homepage preview store ─────────────────────────────────────────

interface PreviewEntry {
  config: Record<string, unknown>;
  expiresAt: number;
}

const previewStore = new Map<string, PreviewEntry>();
const PREVIEW_TTL_MS = 30 * 60 * 1000; // 30 minutes

function purgeExpiredPreviews() {
  const now = Date.now();
  for (const [token, entry] of previewStore) {
    if (entry.expiresAt < now) previewStore.delete(token);
  }
}

function generatePreviewToken(): string {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// POST /api/stores/:storeKey/homepage-visual/preview — admin only; stores config in memory, returns token
router.post("/stores/:storeKey/homepage-visual/preview", requireAdmin, async (req, res) => {
  const storeKey = String(req.params.storeKey);

  const [store] = await db.select().from(storesTable).where(eq(storesTable.storeKey, storeKey)).limit(1);
  if (!store) return res.status(404).json({ error: "Store not found" });

  const parsed = homepageVisualConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  purgeExpiredPreviews();
  const token = generatePreviewToken();
  previewStore.set(token, {
    config: { ...(parsed.data as Record<string, unknown>), _storeKey: storeKey },
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  });

  return res.json({ token });
});

// GET /api/stores/homepage-visual/preview/:token — public; fetch a stored preview config
// Must be placed before /api/stores/:storeKey routes to avoid capturing "homepage-visual"
router.get("/stores/homepage-visual/preview/:token", (req, res) => {
  purgeExpiredPreviews();
  const entry = previewStore.get(String(req.params.token));
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Preview not found or expired" });
  }
  return res.json(entry.config);
});

// GET /api/stores — public endpoint: returns active store configs (for store selector + resolver)
router.get("/stores", async (_req, res) => {
  const stores = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.active, true))
    .orderBy(storesTable.createdAt);

  return res.json(stores.map((s) => serializeStore(s)));
});

// GET /api/stores/resolve — resolve a store from domain or route prefix
// Must come before /api/stores/:storeKey to avoid param capture
router.get("/stores/resolve", async (req, res) => {
  const domain = req.query.domain ? String(req.query.domain) : null;
  const prefix = req.query.prefix ? String(req.query.prefix) : null;
  const fallback = req.query.fallback ? String(req.query.fallback) : "postsofspain";

  const stores = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.active, true));

  let resolved = null as typeof storesTable.$inferSelect | null;

  // 1. Route prefix
  if (prefix && !resolved) {
    resolved = stores.find((s) => s.routePrefix === prefix) ?? null;
  }

  // 2. Domain
  if (domain && !resolved) {
    const cleanDomain = domain.replace(/^www\./, "").toLowerCase();
    resolved = stores.find((s) => {
      if (s.primaryDomain && s.primaryDomain.replace(/^www\./, "").toLowerCase() === cleanDomain) return true;
      const aliases = (s.domainAliases as string[] | null) ?? [];
      return aliases.some((a) => a.replace(/^www\./, "").toLowerCase() === cleanDomain);
    }) ?? null;
  }

  // 3. Fallback
  if (!resolved) {
    resolved = stores.find((s) => s.storeKey === fallback) ?? stores[0] ?? null;
  }

  if (!resolved) {
    return res.status(404).json({ error: "No matching store found" });
  }

  return res.json(serializeStore(resolved));
});

// ── Homepage visual config (admin) ────────────────────────────────────────────

const heroButtonStyleSchema = z.object({
  textColor: z.string().nullable().optional(),
  backgroundColor: z.string().nullable().optional(),
  borderColor: z.string().nullable().optional(),
}).nullable().optional();

const heroButtonConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  link: z.string(),
  variant: z.enum(["filled", "outline"]).optional(),
  visible: z.boolean().optional(),
  style: heroButtonStyleSchema,
  showDesktop: z.boolean().optional(),
  showMobile: z.boolean().optional(),
});

const heroTrustBadgeSchema = z.object({
  id: z.string(),
  text: z.string(),
  showMobile: z.boolean().optional(),
});

const heroVisualSchema = z.object({
  backgroundImageUrl: z.string().nullable().optional(),
  backgroundStoragePath: z.string().nullable().optional(),
  backgroundOverlayOpacity: z.number().min(0).max(1).optional(),
  primaryButtonText: z.string().nullable().optional(),
  primaryButtonVariant: z.enum(["filled", "outline"]).optional(),
  primaryButtonLink: z.string().nullable().optional(),
  primaryButtonStyle: heroButtonStyleSchema,
  primaryButtonShowMobile: z.boolean().optional(),
  primaryButtonShowDesktop: z.boolean().optional(),
  secondaryButtonText: z.string().nullable().optional(),
  secondaryButtonVariant: z.enum(["filled", "outline"]).optional(),
  secondaryButtonLink: z.string().nullable().optional(),
  secondaryButtonStyle: heroButtonStyleSchema,
  secondaryButtonShowMobile: z.boolean().optional(),
  secondaryButtonShowDesktop: z.boolean().optional(),
  extraButtons: z.array(heroButtonConfigSchema).optional(),
  trustBadges: z.array(heroTrustBadgeSchema).optional(),
}).optional();

const sectionFontOverridesSchema = z.object({
  headingFont: z.string().nullable().optional(),
  bodyFont: z.string().nullable().optional(),
}).nullable().optional();

const sectionColorOverridesSchema = z.object({
  eyebrowColor: z.string().nullable().optional(),
  headingColor: z.string().nullable().optional(),
  textColor: z.string().nullable().optional(),
  linkColor: z.string().nullable().optional(),
  buttonTextColor: z.string().nullable().optional(),
  backgroundColor: z.string().nullable().optional(),
  overlayColor: z.string().nullable().optional(),
  overlayOpacity: z.number().min(0).max(1).nullable().optional(),
  posterTitleColor: z.string().nullable().optional(),
  posterPriceColor: z.string().nullable().optional(),
}).nullable().optional();

const collectionBannerVisualBaseSchema = z.object({
  id: z.string().optional(),
  visible: z.boolean().optional(),
  backgroundImageUrl: z.string().nullable().optional(),
  backgroundStoragePath: z.string().nullable().optional(),
  backgroundOverlayOpacity: z.number().min(0).max(1).optional(),
  eyebrow: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  ctaText: z.string().nullable().optional(),
  ctaLink: z.string().nullable().optional(),
  imageFit: z.enum(["cover", "contain"]).optional(),
  focalPointX: z.enum(["left", "center", "right"]).optional(),
  focalPointY: z.enum(["top", "center", "bottom"]).optional(),
  showPosterCards: z.boolean().optional(),
  fontOverrides: sectionFontOverridesSchema,
  colorOverrides: sectionColorOverridesSchema,
  textHAlign: z.enum(["left", "center", "right"]).optional(),
  textVAlign: z.enum(["top", "center", "bottom"]).optional(),
  textMaxWidth: z.enum(["narrow", "medium", "wide"]).optional(),
  textOverlay: z.enum(["none", "soft-panel", "gradient"]).optional(),
  mobileMode: z.enum(["full-banner", "simplified-card", "hidden"]).optional(),
  textOffsetX: z.number().min(-300).max(300).optional(),
  textOffsetY: z.number().min(-300).max(300).optional(),
});

const collectionBannerVisualSchema = collectionBannerVisualBaseSchema.optional();

const homepageSectionTypeSchema = z.enum([
  "hero",
  "featuredPosters",
  "collectionBanner",
  "exploreLinks",
  "newArrivals",
  "brandStory",
  "valueProps",
]);

const homepageSectionConfigSchema = z.object({
  id: z.string(),
  type: homepageSectionTypeSchema,
  visible: z.boolean(),
  sortOrder: z.number(),
  titleOverride: z.string().nullable().optional(),
  bannerId: z.string().nullable().optional(),
  fontOverrides: sectionFontOverridesSchema,
  colorOverrides: sectionColorOverridesSchema,
});

const homepageVisualConfigSchema = z.object({
  hero: heroVisualSchema,
  sections: z.array(homepageSectionConfigSchema).optional(),
  collectionBanners: z.array(collectionBannerVisualBaseSchema).optional(),
  collectionBanner: collectionBannerVisualSchema,
});

// GET /api/admin/stores/:storeKey/homepage-visual
router.get("/admin/stores/:storeKey/homepage-visual", requireAdmin, async (req, res) => {
  const storeKey = String(req.params.storeKey);
  const [store] = await db.select().from(storesTable).where(eq(storesTable.storeKey, storeKey)).limit(1);
  if (!store) return res.status(404).json({ error: "Store not found" });
  return res.json((store.homepageVisualConfig as object) ?? {});
});

// PUT /api/admin/stores/:storeKey/homepage-visual
router.put("/admin/stores/:storeKey/homepage-visual", requireAdmin, async (req, res) => {
  const storeKey = String(req.params.storeKey);

  const [store] = await db.select().from(storesTable).where(eq(storesTable.storeKey, storeKey)).limit(1);
  if (!store) return res.status(404).json({ error: "Store not found" });

  const parsed = homepageVisualConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = (store.homepageVisualConfig ?? {}) as Record<string, unknown>;
  const incoming = parsed.data as Record<string, unknown>;

  // Helper: delete a storage path if it changed
  async function maybeDeletePath(oldPath: string | null | undefined, newPath: string | null | undefined, label: string) {
    if (oldPath && oldPath !== newPath) {
      try {
        const file = await objectStorageService.getObjectEntityFile(oldPath);
        await file.delete();
      } catch (err) {
        req.log.warn({ err }, `Failed to delete old ${label} from storage`);
      }
    }
  }

  // Clean up hero background
  const oldHeroPath = (existing["hero"] as Record<string, unknown> | undefined)?.["backgroundStoragePath"] as string | null | undefined;
  const newHeroPath = (incoming["hero"] as Record<string, unknown> | undefined)?.["backgroundStoragePath"] as string | null | undefined;
  await maybeDeletePath(oldHeroPath, newHeroPath, "hero background image");

  // Clean up legacy single collection banner
  const oldCollPath = (existing["collectionBanner"] as Record<string, unknown> | undefined)?.["backgroundStoragePath"] as string | null | undefined;
  const newCollPath = (incoming["collectionBanner"] as Record<string, unknown> | undefined)?.["backgroundStoragePath"] as string | null | undefined;
  await maybeDeletePath(oldCollPath, newCollPath, "collection banner background image");

  // Clean up collectionBanners array: delete paths that no longer appear in incoming
  const oldBanners = (existing["collectionBanners"] as Array<Record<string, unknown>> | undefined) ?? [];
  const newBannerPaths = new Set(
    ((incoming["collectionBanners"] as Array<Record<string, unknown>> | undefined) ?? [])
      .map((b) => b["backgroundStoragePath"] as string | null | undefined)
      .filter(Boolean)
  );
  for (const ob of oldBanners) {
    const oldPath = ob["backgroundStoragePath"] as string | null | undefined;
    if (oldPath && !newBannerPaths.has(oldPath)) {
      await maybeDeletePath(oldPath, undefined, `collection banner (${ob["id"] ?? "unknown"}) background image`);
    }
  }

  const [updated] = await db
    .update(storesTable)
    .set({ homepageVisualConfig: parsed.data, updatedAt: new Date() })
    .where(eq(storesTable.storeKey, storeKey))
    .returning();

  return res.json((updated.homepageVisualConfig as object) ?? {});
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
    primaryDomain: store.primaryDomain ?? null,
    domainAliases: (store.domainAliases as string[] | null) ?? null,
    routePrefix: store.routePrefix ?? null,
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
    logoUrl: store.logoUrl ?? null,
    logoAltText: store.logoAltText ?? null,
    homepageVisualConfig: (store.homepageVisualConfig as object) ?? null,
    typographyConfig: (store.typographyConfig as object) ?? null,
  });
});

export default router;
