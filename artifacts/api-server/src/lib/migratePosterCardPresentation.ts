import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migratePosterCardPresentation(): Promise<void> {
  const client = await pool.connect();
  try {
    const columnCheck = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'stores' AND column_name = 'poster_card_presentation'`
    );
    if (columnCheck.rows.length === 0) {
      await client.query(
        `ALTER TABLE stores ADD COLUMN poster_card_presentation TEXT`
      );
      logger.info("Added poster_card_presentation column to stores");
    }

    logger.info("Poster card presentation migration completed");
  } catch (err) {
    logger.error({ err }, "Poster card presentation migration failed");
  } finally {
    client.release();
  }
}
