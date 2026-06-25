import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateProductCardBgColor(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='product_card_bg_color'`
    );
    if (res.rows.length === 0) {
      await client.query(`ALTER TABLE stores ADD COLUMN product_card_bg_color TEXT`);
      logger.info("Added product_card_bg_color column to stores");
    }
    logger.info("Product card bg color migration completed");
  } catch (err) {
    logger.error({ err }, "Product card bg color migration failed");
  } finally {
    client.release();
  }
}
