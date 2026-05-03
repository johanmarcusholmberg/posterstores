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

const SEED_TEMPLATES = [
  {
    name: "Simple white wall with black frame",
    templateKey: "white-wall-black-frame",
    frameType: "black",
    category: "Wall",
    orientation: "portrait",
    supportedOrientation: "portrait",
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
    description: "Rich terracotta textured wall with a bold black frame",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1600210492493-0946911123ea?w=600&q=80",
    sortOrder: 3,
  },
  {
    name: "Mediterranean living room",
    templateKey: "mediterranean-living-room",
    frameType: "none",
    category: "Interior",
    orientation: "any",
    supportedOrientation: "any",
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
    description: "Modern kitchen wall display between cabinets",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80",
    sortOrder: 6,
  },
  {
    name: "Gallery wall",
    templateKey: "gallery-wall",
    frameType: "mixed",
    category: "Decorative",
    orientation: "any",
    supportedOrientation: "any",
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
    description: "Wall display with a person for scale reference",
    previewThumbnailUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80",
    sortOrder: 10,
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
  "detectionConfidence",
  "detectionDescription",
  "detectionSource",
  "detectionModel",
  "detectedAt",
  "placementWasManuallyAdjusted",
] as const;

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
    posterX: rest.posterX ?? null,
    posterY: rest.posterY ?? null,
    posterWidth: rest.posterWidth ?? null,
    posterHeight: rest.posterHeight ?? null,
    rotation: rest.rotation ?? null,
    borderRadius: rest.borderRadius ?? null,
    shadowStrength: rest.shadowStrength ?? null,
  };

  const [template] = await db
    .insert(mockupTemplatesTable)
    .values(values)
    .returning();

  return res.status(201).json(template);
});

router.put("/mockup-templates/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db.select().from(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const updates: Partial<typeof mockupTemplatesTable.$inferInsert> = {};
  for (const key of ALLOWED_TEMPLATE_FIELDS) {
    if (req.body[key] !== undefined) {
      (updates as any)[key] = req.body[key];
    }
  }

  const [updated] = await db
    .update(mockupTemplatesTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(mockupTemplatesTable.id, id))
    .returning();

  return res.json(updated);
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

  const { mockupTemplateId, mockupImageUrl, sortOrder, isPrimary } = req.body;

  if (isPrimary) {
    await db
      .update(posterMockupsTable)
      .set({ isPrimary: false, updatedAt: new Date() })
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
    const hasPrimary = mockups.some((m: any) => m.isPrimary);
    const toInsert = mockups.map((m: any, idx: number) => ({
      posterId,
      mockupTemplateId: m.mockupTemplateId ?? null,
      mockupImageUrl: m.mockupImageUrl ?? null,
      sortOrder: m.sortOrder ?? idx,
      isPrimary: hasPrimary ? (m.isPrimary ?? false) : idx === 0,
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
