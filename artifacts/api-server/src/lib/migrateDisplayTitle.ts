import { pool, db, postersTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "./logger";

const DISPLAY_TITLE_MAX_LENGTH = 28;

/**
 * Backfill entries: map full title (matched by store key + exact title) to a
 * short display title. Only applies when display_title is currently NULL.
 */
const BACKFILL: Array<{ storeKey: string; title: string; displayTitle: string }> = [
  { storeKey: "postsofspain", title: "Alicante Harbour at Dusk", displayTitle: "Alicante Harbour" },
  {
    storeKey: "postsofspain",
    title: "Barceloneta Beach, Blue Morning",
    displayTitle: "Barceloneta Beach",
  },
  {
    storeKey: "postsofspain",
    title: "Valencia Cathedral at Golden Hour",
    displayTitle: "Valencia Cathedral",
  },
  { storeKey: "postsofspain", title: "Cádiz — Land's End", displayTitle: "Cádiz Land's End" },
];

export async function migrateDisplayTitle(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='posters' AND column_name='display_title'`
    );
    if (res.rows.length === 0) {
      await client.query(
        `ALTER TABLE posters ADD COLUMN display_title TEXT CHECK (char_length(display_title) <= ${DISPLAY_TITLE_MAX_LENGTH})`
      );
      logger.info("Added display_title column to posters table");
    }
  } finally {
    client.release();
  }

  let backfilled = 0;
  for (const entry of BACKFILL) {
    const [existing] = await db
      .select({ id: postersTable.id, displayTitle: postersTable.displayTitle })
      .from(postersTable)
      .where(
        and(eq(postersTable.storeKey, entry.storeKey), eq(postersTable.title, entry.title))
      )
      .limit(1);

    if (existing && existing.displayTitle == null) {
      await db
        .update(postersTable)
        .set({ displayTitle: entry.displayTitle })
        .where(eq(postersTable.id, existing.id));
      backfilled++;
    }
  }

  if (backfilled > 0) {
    logger.info({ backfilled }, "Backfilled display_title for existing posters");
  }
}
