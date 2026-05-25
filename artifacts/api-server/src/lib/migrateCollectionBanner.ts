import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateCollectionBanner(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='posters' AND column_name='is_collection_banner'`
    );
    if (res.rows.length === 0) {
      await client.query(
        `ALTER TABLE posters ADD COLUMN is_collection_banner BOOLEAN NOT NULL DEFAULT FALSE`
      );
      logger.info("Added is_collection_banner column to posters table");
    }
  } finally {
    client.release();
  }
}
