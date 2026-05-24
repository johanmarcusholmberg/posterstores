import { pool } from "@workspace/db";
import { logger } from "./logger";

const POSTSOFSPAIN_DEFAULT_TYPOGRAPHY = {
  heroTextMode: "dark",
  heroHeadingColor: "#2F80A8",
  heroSubtitleColor: "rgba(31,42,51,0.70)",
  heroBulletColor: "rgba(31,42,51,0.45)",
  heroOverlayMode: "none",
};

export async function migrateTypographyConfig(): Promise<void> {
  const client = await pool.connect();
  try {
    const columnCheck = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'stores' AND column_name = 'typography_config'`
    );
    if (columnCheck.rows.length === 0) {
      await client.query(
        `ALTER TABLE stores ADD COLUMN typography_config JSONB`
      );
      logger.info("Added typography_config column to stores");
    }

    const backfill = await client.query(
      `UPDATE stores
       SET typography_config = $1
       WHERE store_key = 'postsofspain' AND typography_config IS NULL`,
      [JSON.stringify(POSTSOFSPAIN_DEFAULT_TYPOGRAPHY)]
    );
    if (backfill.rowCount && backfill.rowCount > 0) {
      logger.info("Seeded default typography_config for postsofspain");
    }

    logger.info("Typography config migration completed");
  } catch (err) {
    logger.error({ err }, "Typography config migration failed");
  } finally {
    client.release();
  }
}
