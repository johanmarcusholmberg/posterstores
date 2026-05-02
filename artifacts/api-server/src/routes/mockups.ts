import { Router } from "express";
import { db } from "@workspace/db";
import {
  mockupTemplatesTable,
  posterMockupsTable,
  postersTable,
} from "@workspace/db";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

const SEED_TEMPLATES = [
  {
    name: "Simple white wall with black frame",
    templateKey: "white-wall-black-frame",
    frameType: "black",
    supportedOrientation: "portrait",
    description: "Clean white wall background with a sleek black frame",
    sortOrder: 1,
  },
  {
    name: "Warm beige wall with oak frame",
    templateKey: "beige-wall-oak-frame",
    frameType: "oak",
    supportedOrientation: "portrait",
    description: "Warm beige wall paired with a natural oak wooden frame",
    sortOrder: 2,
  },
  {
    name: "Terracotta wall with black frame",
    templateKey: "terracotta-wall-black-frame",
    frameType: "black",
    supportedOrientation: "portrait",
    description: "Rich terracotta textured wall with a bold black frame",
    sortOrder: 3,
  },
  {
    name: "Mediterranean living room",
    templateKey: "mediterranean-living-room",
    frameType: "none",
    supportedOrientation: "any",
    description: "Sun-drenched Mediterranean style living room setting",
    sortOrder: 4,
  },
  {
    name: "Café table flat lay",
    templateKey: "cafe-table-flat-lay",
    frameType: "none",
    supportedOrientation: "portrait",
    description: "Flat lay on a café wooden table with coffee accessories",
    sortOrder: 5,
  },
  {
    name: "Kitchen wall",
    templateKey: "kitchen-wall",
    frameType: "black",
    supportedOrientation: "portrait",
    description: "Modern kitchen wall display between cabinets",
    sortOrder: 6,
  },
  {
    name: "Gallery wall",
    templateKey: "gallery-wall",
    frameType: "mixed",
    supportedOrientation: "any",
    description: "Multi-frame gallery wall arrangement",
    sortOrder: 7,
  },
  {
    name: "Minimal bedroom",
    templateKey: "minimal-bedroom",
    frameType: "white",
    supportedOrientation: "portrait",
    description: "Minimalist Scandinavian bedroom above the headboard",
    sortOrder: 8,
  },
  {
    name: "Close-up frame detail",
    templateKey: "close-up-frame-detail",
    frameType: "black",
    supportedOrientation: "portrait",
    description: "Macro close-up showing frame quality and print texture",
    sortOrder: 9,
  },
  {
    name: "Size comparison wall",
    templateKey: "size-comparison-wall",
    frameType: "none",
    supportedOrientation: "portrait",
    description: "Wall display with a person for scale reference",
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
    }))
  );
}

router.get("/mockup-templates", async (req, res) => {
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

router.post("/mockup-templates", requireAdmin, async (req, res) => {
  const { name, templateKey, frameType, description, storeKey, supportedOrientation, supportedAspectRatio, previewThumbnailUrl, backgroundImageUrl, active, sortOrder } = req.body;

  if (!name || !templateKey) {
    return res.status(400).json({ error: "name and templateKey are required" });
  }

  const [template] = await db
    .insert(mockupTemplatesTable)
    .values({
      name,
      templateKey,
      frameType: frameType ?? "none",
      description: description ?? null,
      storeKey: storeKey ?? null,
      supportedOrientation: supportedOrientation ?? null,
      supportedAspectRatio: supportedAspectRatio ?? null,
      previewThumbnailUrl: previewThumbnailUrl ?? null,
      backgroundImageUrl: backgroundImageUrl ?? null,
      active: active ?? true,
      sortOrder: sortOrder ?? 0,
    })
    .returning();

  return res.status(201).json(template);
});

router.put("/mockup-templates/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db.select().from(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const updates: Partial<typeof mockupTemplatesTable.$inferInsert> = {};
  const allowed = ["name", "templateKey", "frameType", "description", "storeKey", "supportedOrientation", "supportedAspectRatio", "previewThumbnailUrl", "backgroundImageUrl", "active", "sortOrder"] as const;
  for (const key of allowed) {
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

  await db.delete(mockupTemplatesTable).where(eq(mockupTemplatesTable.id, id));
  return res.status(204).send();
});

router.get("/posters/:id/mockups", async (req, res) => {
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
        previewThumbnailUrl: mockupTemplatesTable.previewThumbnailUrl,
        storeKey: mockupTemplatesTable.storeKey,
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
        previewThumbnailUrl: mockupTemplatesTable.previewThumbnailUrl,
        storeKey: mockupTemplatesTable.storeKey,
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
