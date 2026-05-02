import { Router } from "express";
import { db } from "@workspace/db";
import { posterSizesTable, postersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

function isAdminRequest(req: import("express").Request): boolean {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) return false;
  return req.headers["x-admin-token"] === token;
}

export function serializePosterSize(s: typeof posterSizesTable.$inferSelect) {
  return {
    ...s,
    price: Number(s.price),
    widthCm: s.widthCm != null ? Number(s.widthCm) : null,
    heightCm: s.heightCm != null ? Number(s.heightCm) : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/posters/:id/sizes", async (req, res) => {
  const posterId = Number(req.params.id);
  if (isNaN(posterId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const adminRequest = isAdminRequest(req);
  const activeOnly = req.query.activeOnly !== "false" && !adminRequest;

  const [poster] = await db.select({ id: postersTable.id }).from(postersTable).where(
    and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey))
  );
  if (!poster) return res.status(404).json({ error: "Not found" });

  const sizes = await db
    .select()
    .from(posterSizesTable)
    .where(eq(posterSizesTable.posterId, posterId))
    .orderBy(asc(posterSizesTable.sortOrder));

  const filtered = activeOnly ? sizes.filter(s => s.active) : sizes;
  return res.json(filtered.map(serializePosterSize));
});

router.put("/posters/:id/sizes", requireAdmin, async (req, res) => {
  const posterId = Number(req.params.id);
  if (isNaN(posterId)) return res.status(400).json({ error: "Invalid id" });

  const storeKey = typeof req.query.storeKey === "string" ? req.query.storeKey : undefined;
  const { sizes } = req.body as {
    sizes: Array<{
      sizeLabel: string;
      widthCm?: number | null;
      heightCm?: number | null;
      price: number;
      currency: string;
      active?: boolean;
      sortOrder?: number;
    }>;
  };

  if (!Array.isArray(sizes)) return res.status(400).json({ error: "sizes must be an array" });

  if (storeKey) {
    const [poster] = await db.select({ id: postersTable.id }).from(postersTable).where(
      and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey))
    );
    if (!poster) return res.status(404).json({ error: "Not found" });
  }

  await db.delete(posterSizesTable).where(eq(posterSizesTable.posterId, posterId));

  if (sizes.length > 0) {
    await db.insert(posterSizesTable).values(
      sizes.map((s, idx) => ({
        posterId,
        sizeLabel: s.sizeLabel,
        widthCm: s.widthCm != null ? String(s.widthCm) : null,
        heightCm: s.heightCm != null ? String(s.heightCm) : null,
        price: String(s.price),
        currency: s.currency ?? "EUR",
        active: s.active ?? true,
        sortOrder: s.sortOrder ?? idx,
      }))
    );
  }

  const updated = await db
    .select()
    .from(posterSizesTable)
    .where(eq(posterSizesTable.posterId, posterId))
    .orderBy(asc(posterSizesTable.sortOrder));

  return res.json(updated.map(serializePosterSize));
});

export default router;
