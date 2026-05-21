import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateCompositingSettings(): Promise<void> {
  const client = await pool.connect();
  try {
    const addColumnIfMissing = async (
      table: string,
      column: string,
      type: string,
      defaultVal?: string
    ) => {
      const res = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
        [table, column]
      );
      if (res.rows.length === 0) {
        const defaultClause = defaultVal !== undefined ? ` DEFAULT ${defaultVal}` : "";
        await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${defaultClause}`);
        logger.info(`Added column ${column} to ${table}`);
      }
    };

    await addColumnIfMissing("mockup_templates", "fit_mode", "TEXT", "'cover'");
    await addColumnIfMissing("mockup_templates", "shadow_enabled", "BOOLEAN", "true");
    await addColumnIfMissing("mockup_templates", "shadow_opacity", "REAL", "0.4");
    await addColumnIfMissing("mockup_templates", "shadow_blur", "REAL", "20");
    await addColumnIfMissing("mockup_templates", "shadow_offset_x", "REAL", "2");
    await addColumnIfMissing("mockup_templates", "shadow_offset_y", "REAL", "6");
    await addColumnIfMissing("mockup_templates", "inner_shadow_enabled", "BOOLEAN", "true");
    await addColumnIfMissing("mockup_templates", "inner_shadow_opacity", "REAL", "0.25");
    await addColumnIfMissing("mockup_templates", "brightness", "REAL", "0.94");
    await addColumnIfMissing("mockup_templates", "contrast", "REAL", "0.97");
    await addColumnIfMissing("mockup_templates", "saturation", "REAL", "0.92");
    await addColumnIfMissing("mockup_templates", "composite_blur", "REAL", "0");

    logger.info("Compositing settings migration completed");
  } catch (err) {
    logger.error({ err }, "Compositing settings migration failed");
  } finally {
    client.release();
  }
}
