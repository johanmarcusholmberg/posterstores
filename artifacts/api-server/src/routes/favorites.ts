import { Router } from "express";
import { db } from "@workspace/db";
import { favoritesTable, postersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";

const router = Router();

async function getFavoritedPosters(userId: number, storeKey: string) {
  const rows = await db
    .select()
    .from(favoritesTable)
    .leftJoin(postersTable, eq(favoritesTable.posterId, postersTable.id))
    .where(and(
      eq(favoritesTable.userId, userId),
      eq(postersTable.storeKey, storeKey),
    ));

  return rows
    .filter(row => row.posters !== null)
    .map(row => ({
      ...row.posters!,
      price: Number(row.posters!.price),
      createdAt: row.posters!.createdAt.toISOString(),
    }));
}

const addFavoriteSchema = z.object({
  posterId: z.number().int().positive(),
  storeKey: z.string().min(1),
});

const removeFavoriteSchema = z.object({
  posterId: z.coerce.number().int().positive(),
  storeKey: z.string().min(1),
});

router.get("/user/favorites", requireAuth, async (req, res) => {
  const storeKey = req.query.storeKey as string;
  if (!storeKey) return res.status(400).json({ error: "storeKey is required" });

  const posters = await getFavoritedPosters(req.user!.id, storeKey);
  return res.json(posters);
});

router.post("/user/favorites", requireAuth, async (req, res) => {
  const body = addFavoriteSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { posterId, storeKey } = body.data;
  const userId = req.user!.id;

  const [poster] = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.id, posterId), eq(postersTable.storeKey, storeKey)));

  if (!poster) {
    return res.status(404).json({ error: "Poster not found in this store" });
  }

  await db
    .insert(favoritesTable)
    .values({ userId, posterId })
    .onConflictDoNothing();

  const posters = await getFavoritedPosters(userId, storeKey);
  return res.json(posters);
});

router.delete("/user/favorites", requireAuth, async (req, res) => {
  const query = removeFavoriteSchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });

  const { posterId, storeKey } = query.data;
  const userId = req.user!.id;

  await db
    .delete(favoritesTable)
    .where(and(
      eq(favoritesTable.userId, userId),
      eq(favoritesTable.posterId, posterId),
    ));

  const posters = await getFavoritedPosters(userId, storeKey);
  return res.json(posters);
});

export default router;
