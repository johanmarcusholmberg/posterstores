import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateHomepageVisual(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='homepage_visual_config'`
    );
    if (res.rows.length === 0) {
      await client.query(`ALTER TABLE stores ADD COLUMN homepage_visual_config JSONB`);
      logger.info("Added column homepage_visual_config to stores");
    }
    logger.info("Homepage visual config migration completed");
  } catch (err) {
    logger.error({ err }, "Homepage visual config migration failed");
  } finally {
    client.release();
  }
}
