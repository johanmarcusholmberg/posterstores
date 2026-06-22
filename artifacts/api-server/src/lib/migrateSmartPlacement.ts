import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateSmartPlacement(): Promise<void> {
  const client = await pool.connect();
  try {
    const addColumnIfMissing = async (
      table: string,
      column: string,
      type: string
    ) => {
      const res = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
        [table, column]
      );
      if (res.rows.length === 0) {
        await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        logger.info(`Added column ${column} to ${table}`);
      }
    };

    await addColumnIfMissing("mockup_templates", "placement_mode", "TEXT NOT NULL DEFAULT 'manual'");
    await addColumnIfMissing("mockup_templates", "detected_placement_config", "JSONB");
    await addColumnIfMissing("mockup_templates", "detected_placement_status", "TEXT NOT NULL DEFAULT 'not_analyzed'");
    await addColumnIfMissing("mockup_templates", "detected_placement_error", "TEXT");
    await addColumnIfMissing("mockup_templates", "analyzed_at", "TIMESTAMPTZ");

    logger.info("Smart placement migration completed");
  } catch (err) {
    logger.error({ err }, "Smart placement migration failed");
  } finally {
    client.release();
  }
}
