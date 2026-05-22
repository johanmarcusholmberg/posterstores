import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateHoverMockup(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='poster_mockups' AND column_name='is_hover_mockup'`
    );
    if (res.rows.length === 0) {
      await client.query(
        `ALTER TABLE poster_mockups ADD COLUMN is_hover_mockup BOOLEAN NOT NULL DEFAULT FALSE`
      );
      logger.info("Added is_hover_mockup column to poster_mockups");
    }
  } catch (err) {
    logger.error({ err }, "migrateHoverMockup failed");
  } finally {
    client.release();
  }
}
