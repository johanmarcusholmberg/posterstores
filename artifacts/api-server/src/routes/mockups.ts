import { Router } from "express";
import { db } from "@workspace/db";
import {
  mockupTemplatesTable,
  posterMockupsTable,
  postersTable,
} from "@workspace/db";
import { eq, and, or, isNull, asc, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";

const router = Router();

// ─── Format compatibility helpers ──────────────────────────────────────────

/**
 * Infer a poster's orientation from its size label, e.g. "50x70" → portrait,
 * "70x50" → landscape, "50x50" → square, "A4/A3/A2" → portrait.
 */
export function getPosterOrientation(
  sizeLabel: string
): "portrait" | "landscape" | "square" {
  if (/^A\d+$/i.test(sizeLabel)) return "portrait";
  const match = sizeLabel.match(/^(\d+)[xX×](\d+)$/);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    if (w === h) return "square";
    return w > h ? "landscape" : "portrait";
  }
  return "portrait";
}

/**
 * Returns true when a mockup template is compatible with the given poster format.
 * Priority:
 *  1. Exact format match (supportedFormats includes the label, e.g. "50x70")
 *  2. Template orientation matches poster orientation (or template is "any")
 *  3. Template has no supportedFormats restriction at all → always compatible
 */
export function isFormatCompatible(
  templateFormats: string[] | null | undefined,
  templateOrientation: string | null | undefined,
  posterFormat: string
): boolean {
  // No formats set → compatible with everything
  if (!templateFormats || templateFormats.length === 0) return true;

  // 1. Exact format match
  if (templateFormats.includes(posterFormat)) return true;

  // 2. Orientation-compatible fallback
  const posterOrientation = getPosterOrientation(posterFormat);
  const tmplOrient = templateOrientation ?? "any";
  if (tmplOrient === "any") return true;
  if (tmplOrient === posterOrientation) return true;

  return false;
}

// ─── Seed data ──────────────────────────────────────────────────────────────

// Portrait formats shared by wall/frame/interior portrait mockups
const PORTRAIT_FORMATS = ["30x40", "50x70", "A4", "A3", "A2"];

const SEED_TEMPLATES = [
  {
    name: "Simple white wall with black frame",
    templateKey: "white-wall-black-frame",
    frameType: "black",
    category: "Wall",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Clean white wall background with a sleek black frame",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80",
    sortOrder: 1,
  },
  {
    name: "Warm beige wall with oak frame",
    templateKey: "beige-wall-oak-frame",
    frameType: "oak",
    category: "Wall",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Warm beige wall paired with a natural oak wooden frame",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&q=80",
    sortOrder: 2,
  },
  {
    name: "Terracotta wall with black frame",
    templateKey: "terracotta-wall-black-frame",
    frameType: "black",
    category: "Wall",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Rich terracotta textured wall with a bold black frame",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1600210492493-0946911123ea?w=600&q=80",
    sortOrder: 3,
  },
  {
    // Genuinely generic — works with any size/orientation in a large room scene
    name: "Mediterranean living room",
    templateKey: "mediterranean-living-room",
    frameType: "none",
    category: "Interior",
    orientation: "any",
    supportedOrientation: "any",
    supportedFormats: null,
    description: "Sun-drenched Mediterranean style living room setting",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=600&q=80",
    sortOrder: 4,
  },
  {
    name: "Café table flat lay",
    templateKey: "cafe-table-flat-lay",
    frameType: "none",
    category: "Café/Table",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Flat lay on a café wooden table with coffee accessories",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80",
    sortOrder: 5,
  },
  {
    name: "Kitchen wall",
    templateKey: "kitchen-wall",
    frameType: "black",
    category: "Interior",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Modern kitchen wall display between cabinets",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80",
    sortOrder: 6,
  },
  {
    // Genuinely generic — gallery walls accommodate mixed sizes and orientations
    name: "Gallery wall",
    templateKey: "gallery-wall",
    frameType: "mixed",
    category: "Decorative",
    orientation: "any",
    supportedOrientation: "any",
    supportedFormats: null,
    description: "Multi-frame gallery wall arrangement",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&q=80",
    sortOrder: 7,
  },
  {
    name: "Minimal bedroom",
    templateKey: "minimal-bedroom",
    frameType: "white",
    category: "Minimal",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Minimalist Scandinavian bedroom above the headboard",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=600&q=80",
    sortOrder: 8,
  },
  {
    name: "Close-up frame detail",
    templateKey: "close-up-frame-detail",
    frameType: "black",
    category: "Frame",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Macro close-up showing frame quality and print texture",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1582738411706-bfc8e691d1c2?w=600&q=80",
    sortOrder: 9,
  },
  {
    name: "Lifestyle living space",
    templateKey: "lifestyle-living-space",
    frameType: "none",
    category: "Lifestyle",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Wall display with a person for scale reference",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80",
    sortOrder: 10,
  },
  {
    name: "Size comparison wall",
    templateKey: "size-comparison-wall",
    frameType: "none",
    category: "Lifestyle",
    orientation: "portrait",
    supportedOrientation: "portrait",
    supportedFormats: PORTRAIT_FORMATS,
    description: "Wall scene showing poster sizes in context for scale reference",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600&q=80",
    sortOrder: 11,
  },
];

export async function seedMockupTemplates() {
  const existing = await db.select().from(mockupTemplatesTable).limit(1);
  if (existing.length > 0) return;

  await db.insert(mockupTemplatesTable).values(
    SEED_TEMPLATES.map((t) => ({
      ...t,
      storeKey: null,
      active: true,
      isFeatured: false,
    }))
  );
}

// ─── Allowed update fields ───────────────────────────────────────────────────

const ALLOWED_TEMPLATE_FIELDS = [
  "name",
  "templateKey",
  "frameType",
  "description",
  "storeKey",
  "supportedOrientation",
  "supportedAspectRatio",
  "previewThumbnailUrl",
  "backgroundImageUrl",
  "storagePath",
  "active",
  "sortOrder",
  "category",
  "orientation",
  "supportedFormats",
  "isFeatured",
  "posterX",
  "posterY",
  "posterWidth",
  "posterHeight",
  "rotation",
  "borderRadius",
  "shadowStrength",
  "fitMode",
  "shadowEnabled",
  "shadowOpacity",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "innerShadowEnabled",
  "innerShadowOpacity",
  "brightness",
  "contrast",
  "saturation",
  "compositeBlur",
  "detectionConfidence",
  "detectionDescription",
  "detectionSource",
  "detectionModel",
  "detectedAt",
  "placementWasManuallyAdjusted",
  "sourceImageWidth",
  "sourceImageHeight",
] as const;

/**
 * Coerce and validate placement fields from request body.
 * Returns null if the values look invalid, otherwise the cleaned numeric values.
 */
function coercePlacementField(
  val: unknown,
  fieldName: string
): number | null | undefined {
  if (val === undefined) return undefined;
  if (val === null || val === "") return null;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (!isFinite(n) || isNaN(n)) {
    throw new Error(`${fieldName} must be a finite number, got: ${JSON.stringify(val)}`);
  }
  return n;
}

/**
 * Like coercePlacementField but also enforces an inclusive [min, max] range.
 * Throws on out-of-range values so the caller's catch block returns 400.
 */
function coerceRanged(
  val: unknown,
  fieldName: string,
  min: number,
  max: number
): number | null | undefined {
  const n = coercePlacementField(val, fieldName);
  if (n === undefined || n === null) return n;
  if (n < min || n > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}, got: ${n}`);
  }
  return n;
}

/**
 * Validate that percentage placement values don't go out of bounds.
 */
function validatePlacementBounds(body: Record<string, unknown>): void {
  const toNum = (k: string) => {
    const v = body[k];
    if (v === undefined || v === null || v === "") return null;
    return parseFloat(String(v));
  };

  const x = toNum("posterX");
  const y = toNum("posterY");
  const w = toNum("posterWidth");
  const h = toNum("posterHeight");

  if (x !== null && (x < 0 || x > 100)) throw new Error(`posterX must be between 0 and 100, got ${x}`);
  if (y !== null && (y < 0 || y > 100)) throw new Error(`posterY must be between 0 and 100, got ${y}`);
  if (w !== null && w <= 0) throw new Error(`posterWidth must be > 0, got ${w}`);
  if (h !== null && h <= 0) throw new Error(`posterHeight must be > 0, got ${h}`);
  if (x !== null && w !== null && x + w > 100.001) throw new Error(`posterX (${x}) + posterWidth (${w}) exceeds 100%`);
  if (y !== null && h !== null && y + h > 100.001) throw new Error(`posterY (${y}) + posterHeight (${h}) exceeds 100%`);
}

/**
 * Coerce a detectedAt value (string ISO or Date) into a proper Date for Drizzle.
 */
function coerceDate(val: unknown): Date | null | undefined {
  if (val === undefined) return undefined;
  if (val === null || val === "") return null;
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    const d = new Date(val);
    if (isNaN(d.getTime())) throw new Error(`detectedAt is not a valid date: ${val}`);
    return d;
  }
  throw new Error(`detectedAt must be a date string or null, got: ${typeof val}`);
}

// ─── Template routes ─────────────────────────────────────────────────────────

router.get("/mockup-templates", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : null;
  const category =
    typeof req.query.category === "string" ? req.query.category : null;
  const orientation =
    typeof req.query.orientation === "string" ? req.query.orientation : null;
  // Optional poster format label for compatibility filtering, e.g. "50x70"
  const format =
    typeof req.query.format === "string" ? req.query.format : null;
  const activeOnly = req.query.activeOnly !== "false";

  const templates = await db
    .select()
    .from(mockupTemplatesTable)
    .where(
      storeKey
        ? or(isNull(mockupTemplatesTable.storeKey), eq(mockupTemplatesTable.storeKey, storeKey))
        : isNull(mockupTemplatesTable.storeKey)
    )
    .orderBy(asc(mockupTemplatesTable.sortOrder), asc(mockupTemplatesTable.id));

  let filtered = templates;

  if (activeOnly) {
    filtered = filtered.filter((t) => t.active);
  }
  if (category) {
    filtered = filtered.filter((t) => t.category === category);
  }
  if (orientation) {
    filtered = filtered.filter(
      (t) =>
        !t.orientation || t.orientation === orientation || t.orientation === "any"
    );
  }
  if (format) {
    // Three-tier format compatibility: exact → orientation-compatible → any
    const exact = filtered.filter((t) =>
      isFormatCompatible(t.supportedFormats, t.orientation, format)
    );
    // exact already includes orientation-compatible and unrestricted templates
    filtered = exact;
  }

  return res.json(filtered);
});

router.get("/mockup-templates/all", requireAdmin, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : null;

  const templates = await db
    .select()
    .from(mockupTemplatesTable)
    .where(
      storeKey
        ? or(isNull(mockupTemplatesTable.storeKey), eq(mockupTemplatesTable.storeKey, storeKey))
        : isNull(mockupTemplatesTable.storeKey)
    )
    .orderBy(asc(mockupTemplatesTable.sortOrder), asc(mockupTemplatesTable.id));

  return res.json(templates);
});

router.get("/mockup-templates/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [template] = await db
    .select()
    .from(mockupTemplatesTable)
    .where(eq(mockupTemplatesTable.id, id));

  if (!template) return res.status(404).json({ error: "Not found" });
  return res.json(template);
});

router.post("/mockup-templates", requireAdmin, async (req, res) => {
  const { name, templateKey, ...rest } = req.body;

  if (!name || !templateKey) {
    return res.status(400).json({ error: "name and templateKey are required" });
  }

  try {
    validatePlacementBounds(rest);

    const values: any = {
      name,
      templateKey,
      frameType: rest.frameType ?? "none",
      description: rest.description ?? null,
      storeKey: rest.storeKey ?? null,
      supportedOrientation: rest.supportedOrientation ?? null,
      supportedAspectRatio: rest.supportedAspectRatio ?? null,
      previewThumbnailUrl: rest.previewThumbnailUrl ?? null,
      backgroundImageUrl: rest.backgroundImageUrl ?? null,
      storagePath: rest.storagePath ?? null,
      active: rest.active ?? true,
      sortOrder: rest.sortOrder ?? 0,
      category: rest.category ?? null,
      orientation: rest.orientation ?? null,
      supportedFormats: rest.supportedFormats ?? null,
      isFeatured: rest.isFeatured ?? false,
      posterX: coercePlacementField(rest.posterX, "posterX") ?? null,
      posterY: coercePlacementField(rest.posterY, "posterY") ?? null,
      posterWidth: coercePlacementField(rest.posterWidth, "posterWidth") ?? null,
      posterHeight: coercePlacementField(rest.posterHeight, "posterHeight") ?? null,
      rotation: coercePlacementField(rest.rotation, "rotation") ?? null,
      borderRadius: coercePlacementField(rest.borderRadius, "borderRadius") ?? null,
      shadowStrength: coercePlacementField(rest.shadowStrength, "shadowStrength") ?? null,
      fitMode: (() => {
        const v = rest.fitMode;
        if (v == null) return "cover";
        if (!["cover", "contain", "stretch"].includes(v)) throw new Error(`fitMode must be 'cover', 'contain', or 'stretch', got: ${v}`);
        return v;
      })(),
      shadowEnabled: rest.shadowEnabled ?? true,
      shadowOpacity: coerceRanged(rest.shadowOpacity, "shadowOpacity", 0, 1) ?? 0.4,
      shadowBlur: coerceRanged(rest.shadowBlur, "shadowBlur", 0, 80) ?? 20,
      shadowOffsetX: coerceRanged(rest.shadowOffsetX, "shadowOffsetX", -50, 50) ?? 2,
      shadowOffsetY: coerceRanged(rest.shadowOffsetY, "shadowOffsetY", -50, 50) ?? 6,
      innerShadowEnabled: rest.innerShadowEnabled ?? true,
      innerShadowOpacity: coerceRanged(rest.innerShadowOpacity, "innerShadowOpacity", 0, 1) ?? 0.25,
      brightness: coerceRanged(rest.brightness, "brightness", 0.5, 1.5) ?? 0.94,
      contrast: coerceRanged(rest.contrast, "contrast", 0.5, 1.5) ?? 0.97,
      saturation: coerceRanged(rest.saturation, "saturation", 0, 2) ?? 0.92,
      compositeBlur: coerceRanged(rest.compositeBlur, "compositeBlur", 0, 3) ?? 0,
      detectedAt: coerceDate(rest.detectedAt) ?? null,
      sourceImageWidth: rest.sourceImageWidth != null ? Math.round(Number(rest.sourceImageWidth)) : null,
      sourceImageHeight: rest.sourceImageHeight != null ? Math.round(Number(rest.sourceImageHeight)) : null,
    };

    const [template] = await db
      .insert(mockupTemplatesTable)
      .values(values)
      .returning();

    return res.status(201).json(template);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create template";
    req.log.error({ err }, "POST /mockup-templates failed");
    const isValidation = msg.length < 300;
    return res.status(isValidation ? 400 : 500).json({ error: msg });
  }
});

router.put("/mockup-templates/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const [existing] = await db.select().from(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    validatePlacementBounds(req.body);

    const updates: Partial<typeof mockupTemplatesTable.$inferInsert> = {};

    for (const key of ALLOWED_TEMPLATE_FIELDS) {
      if (req.body[key] === undefined) continue;

      if (key === "detectedAt") {
        const coerced = coerceDate(req.body[key]);
        if (coerced !== undefined) (updates as any)[key] = coerced;
        continue;
      }

      if (
        key === "posterX" ||
        key === "posterY" ||
        key === "posterWidth" ||
        key === "posterHeight" ||
        key === "rotation" ||
        key === "borderRadius" ||
        key === "shadowStrength" ||
        key === "detectionConfidence"
      ) {
        const coerced = coercePlacementField(req.body[key], key);
        if (coerced !== undefined) (updates as any)[key] = coerced;
        continue;
      }

      if (key === "shadowOpacity") { const c = coerceRanged(req.body[key], key, 0, 1); if (c !== undefined) (updates as any)[key] = c; continue; }
      if (key === "shadowBlur") { const c = coerceRanged(req.body[key], key, 0, 80); if (c !== undefined) (updates as any)[key] = c; continue; }
      if (key === "shadowOffsetX") { const c = coerceRanged(req.body[key], key, -50, 50); if (c !== undefined) (updates as any)[key] = c; continue; }
      if (key === "shadowOffsetY") { const c = coerceRanged(req.body[key], key, -50, 50); if (c !== undefined) (updates as any)[key] = c; continue; }
      if (key === "innerShadowOpacity") { const c = coerceRanged(req.body[key], key, 0, 1); if (c !== undefined) (updates as any)[key] = c; continue; }
      if (key === "brightness") { const c = coerceRanged(req.body[key], key, 0.5, 1.5); if (c !== undefined) (updates as any)[key] = c; continue; }
      if (key === "contrast") { const c = coerceRanged(req.body[key], key, 0.5, 1.5); if (c !== undefined) (updates as any)[key] = c; continue; }
      if (key === "saturation") { const c = coerceRanged(req.body[key], key, 0, 2); if (c !== undefined) (updates as any)[key] = c; continue; }
      if (key === "compositeBlur") { const c = coerceRanged(req.body[key], key, 0, 3); if (c !== undefined) (updates as any)[key] = c; continue; }

      if (key === "fitMode") {
        const v = req.body[key];
        if (v !== undefined) {
          if (v !== null && !["cover", "contain", "stretch"].includes(v)) {
            return res.status(400).json({ error: `fitMode must be 'cover', 'contain', or 'stretch', got: ${v}` });
          }
          (updates as any)[key] = v;
        }
        continue;
      }

      if (key === "sourceImageWidth" || key === "sourceImageHeight") {
        const raw = req.body[key];
        (updates as any)[key] = raw != null ? Math.round(Number(raw)) : null;
        continue;
      }

      (updates as any)[key] = req.body[key];
    }

    const [updated] = await db
      .update(mockupTemplatesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(mockupTemplatesTable.id, id))
      .returning();

    return res.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update template";
    req.log.error({ err }, `PUT /mockup-templates/${id} failed`);
    const isValidation =
      msg.startsWith("posterX") ||
      msg.startsWith("posterY") ||
      msg.startsWith("posterW") ||
      msg.startsWith("posterH") ||
      msg.startsWith("detectedAt") ||
      msg.includes("must be") ||
      msg.includes("exceeds");
    return res.status(isValidation ? 400 : 500).json({ error: msg });
  }
});

router.delete("/mockup-templates/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  // poster_mockups.mockup_template_id has onDelete: "set null" — safe to hard delete.
  await db.delete(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, id));
  return res.status(204).send();
});

// ─── Poster mockup routes ────────────────────────────────────────────────────

router.get("/posters/:id/mockups", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const posterId = Number(req.params.id);
  if (isNaN(posterId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));

  if (!poster) return res.status(404).json({ error: "Poster not found" });

  const mockups = await db
    .select({
      id: posterMockupsTable.id,
      posterId: posterMockupsTable.posterId,
      mockupTemplateId: posterMockupsTable.mockupTemplateId,
      mockupImageUrl: posterMockupsTable.mockupImageUrl,
      sortOrder: posterMockupsTable.sortOrder,
      isPrimary: posterMockupsTable.isPrimary,
      isHoverMockup: posterMockupsTable.isHoverMockup,
      createdAt: posterMockupsTable.createdAt,
      template: {
        id: mockupTemplatesTable.id,
        name: mockupTemplatesTable.name,
        templateKey: mockupTemplatesTable.templateKey,
        frameType: mockupTemplatesTable.frameType,
        category: mockupTemplatesTable.category,
        orientation: mockupTemplatesTable.orientation,
        previewThumbnailUrl: mockupTemplatesTable.previewThumbnailUrl,
        backgroundImageUrl: mockupTemplatesTable.backgroundImageUrl,
        storagePath: mockupTemplatesTable.storagePath,
        storeKey: mockupTemplatesTable.storeKey,
        active: mockupTemplatesTable.active,
        isFeatured: mockupTemplatesTable.isFeatured,
        posterX: mockupTemplatesTable.posterX,
        posterY: mockupTemplatesTable.posterY,
        posterWidth: mockupTemplatesTable.posterWidth,
        posterHeight: mockupTemplatesTable.posterHeight,
        rotation: mockupTemplatesTable.rotation,
        borderRadius: mockupTemplatesTable.borderRadius,
        shadowStrength: mockupTemplatesTable.shadowStrength,
        fitMode: mockupTemplatesTable.fitMode,
        shadowEnabled: mockupTemplatesTable.shadowEnabled,
        shadowOpacity: mockupTemplatesTable.shadowOpacity,
        shadowBlur: mockupTemplatesTable.shadowBlur,
        shadowOffsetX: mockupTemplatesTable.shadowOffsetX,
        shadowOffsetY: mockupTemplatesTable.shadowOffsetY,
        innerShadowEnabled: mockupTemplatesTable.innerShadowEnabled,
        innerShadowOpacity: mockupTemplatesTable.innerShadowOpacity,
        brightness: mockupTemplatesTable.brightness,
        contrast: mockupTemplatesTable.contrast,
        saturation: mockupTemplatesTable.saturation,
        compositeBlur: mockupTemplatesTable.compositeBlur,
      },
    })
    .from(posterMockupsTable)
    .leftJoin(mockupTemplatesTable, eq(posterMockupsTable.mockupTemplateId, mockupTemplatesTable.id))
    .where(eq(posterMockupsTable.posterId, posterId))
    .orderBy(asc(posterMockupsTable.sortOrder), asc(posterMockupsTable.id));

  return res.json(mockups);
});

router.post("/posters/:id/mockups", requireAdmin, async (req, res) => {
  const posterId = Number(req.params.id);
  if (isNaN(posterId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));

  if (!poster) return res.status(404).json({ error: "Poster not found or store mismatch" });

  const { mockupTemplateId, mockupImageUrl, sortOrder, isPrimary, isHoverMockup } = req.body;

  if (isPrimary) {
    await db
      .update(posterMockupsTable)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(posterMockupsTable.posterId, posterId));
  }

  if (isHoverMockup) {
    await db
      .update(posterMockupsTable)
      .set({ isHoverMockup: false, updatedAt: new Date() })
      .where(eq(posterMockupsTable.posterId, posterId));
  }

  const [created] = await db
    .insert(posterMockupsTable)
    .values({
      posterId,
      mockupTemplateId: mockupTemplateId ?? null,
      mockupImageUrl: mockupImageUrl ?? null,
      sortOrder: sortOrder ?? 0,
      isPrimary: isPrimary ?? false,
      isHoverMockup: isHoverMockup ?? false,
    })
    .returning();

  return res.status(201).json(created);
});

router.put("/posters/:id/mockups/batch", requireAdmin, async (req, res) => {
  const posterId = Number(req.params.id);
  if (isNaN(posterId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));

  if (!poster) return res.status(404).json({ error: "Poster not found or store mismatch" });

  const { mockups } = req.body;
  if (!Array.isArray(mockups)) return res.status(400).json({ error: "mockups array required" });

  await db.delete(posterMockupsTable).where(eq(posterMockupsTable.posterId, posterId));

  if (mockups.length > 0) {
    const toInsert = mockups.map((m: any, idx: number) => ({
      posterId,
      mockupTemplateId: m.mockupTemplateId ?? null,
      mockupImageUrl: m.mockupImageUrl ?? null,
      sortOrder: m.sortOrder ?? idx,
      isPrimary: m.isPrimary ?? false,
      isHoverMockup: m.isHoverMockup ?? false,
    }));

    await db.insert(posterMockupsTable).values(toInsert);
  }

  const result = await db
    .select({
      id: posterMockupsTable.id,
      posterId: posterMockupsTable.posterId,
      mockupTemplateId: posterMockupsTable.mockupTemplateId,
      mockupImageUrl: posterMockupsTable.mockupImageUrl,
      sortOrder: posterMockupsTable.sortOrder,
      isPrimary: posterMockupsTable.isPrimary,
      isHoverMockup: posterMockupsTable.isHoverMockup,
      template: {
        id: mockupTemplatesTable.id,
        name: mockupTemplatesTable.name,
        templateKey: mockupTemplatesTable.templateKey,
        frameType: mockupTemplatesTable.frameType,
        category: mockupTemplatesTable.category,
        orientation: mockupTemplatesTable.orientation,
        previewThumbnailUrl: mockupTemplatesTable.previewThumbnailUrl,
        backgroundImageUrl: mockupTemplatesTable.backgroundImageUrl,
        storagePath: mockupTemplatesTable.storagePath,
        storeKey: mockupTemplatesTable.storeKey,
        active: mockupTemplatesTable.active,
        isFeatured: mockupTemplatesTable.isFeatured,
        posterX: mockupTemplatesTable.posterX,
        posterY: mockupTemplatesTable.posterY,
        posterWidth: mockupTemplatesTable.posterWidth,
        posterHeight: mockupTemplatesTable.posterHeight,
        rotation: mockupTemplatesTable.rotation,
        borderRadius: mockupTemplatesTable.borderRadius,
        shadowStrength: mockupTemplatesTable.shadowStrength,
      },
    })
    .from(posterMockupsTable)
    .leftJoin(mockupTemplatesTable, eq(posterMockupsTable.mockupTemplateId, mockupTemplatesTable.id))
    .where(eq(posterMockupsTable.posterId, posterId))
    .orderBy(asc(posterMockupsTable.sortOrder), asc(posterMockupsTable.id));

  return res.json(result);
});

router.patch("/posters/:id/mockups/:mockupId/hover", requireAdmin, async (req, res) => {
  const posterId = Number(req.params.id);
  const mockupId = Number(req.params.mockupId);
  if (isNaN(posterId) || isNaN(mockupId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));
  if (!poster) return res.status(404).json({ error: "Poster not found or store mismatch" });

  await db
    .update(posterMockupsTable)
    .set({ isHoverMockup: false, updatedAt: new Date() })
    .where(eq(posterMockupsTable.posterId, posterId));

  const [updated] = await db
    .update(posterMockupsTable)
    .set({ isHoverMockup: true, updatedAt: new Date() })
    .where(and(eq(posterMockupsTable.id, mockupId), eq(posterMockupsTable.posterId, posterId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Mockup not found" });
  return res.json(updated);
});

router.patch("/posters/:id/mockups/:mockupId/hover/clear", requireAdmin, async (req, res) => {
  const posterId = Number(req.params.id);
  if (isNaN(posterId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));
  if (!poster) return res.status(404).json({ error: "Poster not found or store mismatch" });

  await db
    .update(posterMockupsTable)
    .set({ isHoverMockup: false, updatedAt: new Date() })
    .where(eq(posterMockupsTable.posterId, posterId));

  return res.json({ ok: true });
});

router.patch("/posters/:id/mockups/primary/clear", requireAdmin, async (req, res) => {
  const posterId = Number(req.params.id);
  if (isNaN(posterId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));
  if (!poster) return res.status(404).json({ error: "Poster not found or store mismatch" });

  await db
    .update(posterMockupsTable)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(eq(posterMockupsTable.posterId, posterId));

  return res.json({ ok: true });
});

router.patch("/posters/:id/mockups/:mockupId/primary", requireAdmin, async (req, res) => {
  const posterId = Number(req.params.id);
  const mockupId = Number(req.params.mockupId);
  if (isNaN(posterId) || isNaN(mockupId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));
  if (!poster) return res.status(404).json({ error: "Poster not found or store mismatch" });

  await db
    .update(posterMockupsTable)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(eq(posterMockupsTable.posterId, posterId));

  const [updated] = await db
    .update(posterMockupsTable)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(and(eq(posterMockupsTable.id, mockupId), eq(posterMockupsTable.posterId, posterId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Mockup not found" });
  return res.json(updated);
});

router.delete("/posters/:id/mockups/:mockupId", requireAdmin, async (req, res) => {
  const posterId = Number(req.params.id);
  const mockupId = Number(req.params.mockupId);
  if (isNaN(posterId) || isNaN(mockupId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey =
    typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));
  if (!poster) return res.status(404).json({ error: "Poster not found or store mismatch" });

  await db
    .delete(posterMockupsTable)
    .where(and(eq(posterMockupsTable.id, mockupId), eq(posterMockupsTable.posterId, posterId)));

  return res.status(204).send();
});

export default router;
