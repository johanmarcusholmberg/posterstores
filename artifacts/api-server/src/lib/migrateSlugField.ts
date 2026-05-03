import { db, postersTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";
import { logger } from "./logger";

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function migrateSlugField(): Promise<void> {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        ALTER TABLE posters ADD COLUMN IF NOT EXISTS slug text
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS posters_store_key_slug_unique
        ON posters (store_key, slug)
        WHERE slug IS NOT NULL
      `);
    } finally {
      client.release();
    }

    const posters = await db.select().from(postersTable);

    let migrated = 0;
    for (const poster of posters) {
      if (poster.slug != null && poster.slug !== "") continue;

      const baseSlug = poster.title
        ? generateSlug(poster.title)
        : `poster-${poster.id}`;

      if (!baseSlug) continue;

      let slug = baseSlug;
      let attempt = 0;
      while (true) {
        const candidate = attempt === 0 ? slug : `${baseSlug}-${attempt + 1}`;
        const existing = await db
          .select({ id: postersTable.id })
          .from(postersTable)
          .where(and(eq(postersTable.storeKey, poster.storeKey), eq(postersTable.slug, candidate)))
          .limit(1);
        if (existing.length === 0) {
          slug = candidate;
          break;
        }
        attempt++;
      }

      await db
        .update(postersTable)
        .set({ slug })
        .where(eq(postersTable.id, poster.id));

      migrated++;
    }

    if (migrated > 0) {
      logger.info({ migrated }, "Generated slugs for existing posters");
    }
  } catch (err) {
    logger.error(err, "Failed to migrate slug field");
  }
}
