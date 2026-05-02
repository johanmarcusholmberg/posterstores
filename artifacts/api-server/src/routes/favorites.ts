import { Router } from "express";
import { db } from "@workspace/db";
import { favoritesTable, postersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetFavoritesQueryParams,
  AddFavoriteBody,
  RemoveFavoriteQueryParams,
} from "@workspace/api-zod";

const router = Router();

async function getFavoritedPosters(sessionId: string) {
  const rows = await db
    .select()
    .from(favoritesTable)
    .leftJoin(postersTable, eq(favoritesTable.posterId, postersTable.id))
    .where(eq(favoritesTable.sessionId, sessionId));

  return rows
    .filter(row => row.posters !== null)
    .map(row => ({
      ...row.posters!,
      price: Number(row.posters!.price),
      createdAt: row.posters!.createdAt.toISOString(),
    }));
}

router.get("/favorites", async (req, res) => {
  const query = GetFavoritesQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });

  const posters = await getFavoritedPosters(query.data.sessionId);
  return res.json(posters);
});

router.post("/favorites", async (req, res) => {
  const body = AddFavoriteBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { sessionId, posterId } = body.data;

  await db
    .insert(favoritesTable)
    .values({ sessionId, posterId })
    .onConflictDoNothing();

  const posters = await getFavoritedPosters(sessionId);
  return res.json(posters);
});

router.delete("/favorites", async (req, res) => {
  const query = RemoveFavoriteQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });

  const { sessionId, posterId } = query.data;

  await db
    .delete(favoritesTable)
    .where(and(
      eq(favoritesTable.sessionId, sessionId),
      eq(favoritesTable.posterId, Number(posterId)),
    ));

  const posters = await getFavoritedPosters(sessionId);
  return res.json(posters);
});

export default router;
