import { Router } from "express";
import { db } from "@workspace/db";
import { storeContentPagesTable, storesTable, PAGE_KEYS } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { z } from "zod";

const router = Router();

const PAGE_KEY_SET = new Set(PAGE_KEYS);

const upsertContentPageSchema = z.object({
  title: z.string().min(1, "Title is required"),
  subtitle: z.string().nullable().optional(),
  content: z.string().min(1, "Content is required"),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  published: z.boolean().optional(),
});

// ── GET /admin/content — list all pages for a store (admin) ──────────────────

router.get("/admin/content", requireAdmin, async (req, res) => {
  const storeKey = req.query.storeKey ? String(req.query.storeKey) : null;
  if (!storeKey) {
    return res.status(400).json({ error: "storeKey query parameter is required" });
  }

  const rows = await db
    .select()
    .from(storeContentPagesTable)
    .where(eq(storeContentPagesTable.storeKey, storeKey));

  const rowByPageKey = new Map(rows.map(r => [r.pageKey, r]));

  const pages = PAGE_KEYS.map(pageKey => {
    const row = rowByPageKey.get(pageKey);
    return row
      ? { ...row, hasFallback: false }
      : {
          id: null,
          storeKey,
          pageKey,
          title: null,
          subtitle: null,
          content: null,
          metaTitle: null,
          metaDescription: null,
          published: false,
          createdAt: null,
          updatedAt: null,
          hasFallback: true,
        };
  });

  return res.json(pages);
});

// ── GET /admin/content/:pageKey — get a single page (admin, includes unpublished) ──

router.get("/admin/content/:pageKey", requireAdmin, async (req, res) => {
  const storeKey = req.query.storeKey ? String(req.query.storeKey) : null;
  const pageKey = String(req.params.pageKey);

  if (!storeKey) {
    return res.status(400).json({ error: "storeKey query parameter is required" });
  }
  if (!PAGE_KEY_SET.has(pageKey as typeof PAGE_KEYS[number])) {
    return res.status(400).json({ error: `Invalid pageKey. Must be one of: ${PAGE_KEYS.join(", ")}` });
  }

  const [row] = await db
    .select()
    .from(storeContentPagesTable)
    .where(
      and(
        eq(storeContentPagesTable.storeKey, storeKey),
        eq(storeContentPagesTable.pageKey, pageKey)
      )
    )
    .limit(1);

  if (!row) {
    return res.json({ storeKey, pageKey, exists: false });
  }

  return res.json({ ...row, exists: true });
});

// ── PUT /admin/content/:pageKey — upsert a page ───────────────────────────────

router.put("/admin/content/:pageKey", requireAdmin, async (req, res) => {
  const storeKey = req.query.storeKey ? String(req.query.storeKey) : null;
  const pageKey = String(req.params.pageKey);

  if (!storeKey) {
    return res.status(400).json({ error: "storeKey query parameter is required" });
  }
  if (!PAGE_KEY_SET.has(pageKey as typeof PAGE_KEYS[number])) {
    return res.status(400).json({ error: `Invalid pageKey. Must be one of: ${PAGE_KEYS.join(", ")}` });
  }

  const [store] = await db
    .select({ storeKey: storesTable.storeKey })
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (!store) {
    return res.status(404).json({ error: `Store "${storeKey}" not found` });
  }

  const parsed = upsertContentPageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { title, subtitle, content, metaTitle, metaDescription, published } = parsed.data;
  const now = new Date();

  const [existing] = await db
    .select({ id: storeContentPagesTable.id })
    .from(storeContentPagesTable)
    .where(
      and(
        eq(storeContentPagesTable.storeKey, storeKey),
        eq(storeContentPagesTable.pageKey, pageKey)
      )
    )
    .limit(1);

  let row;
  if (existing) {
    const [updated] = await db
      .update(storeContentPagesTable)
      .set({
        title,
        subtitle: subtitle ?? null,
        content,
        metaTitle: metaTitle ?? null,
        metaDescription: metaDescription ?? null,
        ...(published !== undefined ? { published } : {}),
        updatedAt: now,
      })
      .where(eq(storeContentPagesTable.id, existing.id))
      .returning();
    row = updated;
  } else {
    const [inserted] = await db
      .insert(storeContentPagesTable)
      .values({
        storeKey,
        pageKey,
        title,
        subtitle: subtitle ?? null,
        content,
        metaTitle: metaTitle ?? null,
        metaDescription: metaDescription ?? null,
        published: published ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    row = inserted;
  }

  return res.json(row);
});

// ── GET /content/:pageKey — public, only published ───────────────────────────

router.get("/content/:pageKey", async (req, res) => {
  const storeKey = req.query.storeKey ? String(req.query.storeKey) : null;
  const { pageKey } = req.params;

  if (!storeKey) {
    return res.status(400).json({ error: "storeKey query parameter is required" });
  }
  if (!PAGE_KEY_SET.has(pageKey as typeof PAGE_KEYS[number])) {
    return res.status(400).json({ error: `Invalid pageKey. Must be one of: ${PAGE_KEYS.join(", ")}` });
  }

  const [row] = await db
    .select()
    .from(storeContentPagesTable)
    .where(
      and(
        eq(storeContentPagesTable.storeKey, storeKey),
        eq(storeContentPagesTable.pageKey, pageKey),
        eq(storeContentPagesTable.published, true)
      )
    )
    .limit(1);

  if (!row) {
    return res.json({ storeKey, pageKey, exists: false });
  }

  return res.json({ ...row, exists: true });
});

export default router;
