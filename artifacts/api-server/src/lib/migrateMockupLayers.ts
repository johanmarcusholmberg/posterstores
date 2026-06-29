import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateMockupLayers(): Promise<void> {
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

    await addColumnIfMissing("mockup_templates", "lighting_overlay_url", "TEXT");
    await addColumnIfMissing("mockup_templates", "foreground_image_url", "TEXT");
    await addColumnIfMissing("mockup_templates", "default_lighting_blend_mode", "TEXT NOT NULL DEFAULT 'multiply'");
    await addColumnIfMissing("mockup_templates", "default_lighting_opacity", "REAL NOT NULL DEFAULT 0.8");
    await addColumnIfMissing("mockup_templates", "default_foreground_opacity", "REAL NOT NULL DEFAULT 1.0");

    await addColumnIfMissing("poster_mockups", "use_base", "BOOLEAN NOT NULL DEFAULT true");
    await addColumnIfMissing("poster_mockups", "use_lighting_overlay", "BOOLEAN NOT NULL DEFAULT true");
    await addColumnIfMissing("poster_mockups", "use_foreground", "BOOLEAN NOT NULL DEFAULT true");
    await addColumnIfMissing("poster_mockups", "lighting_opacity_override", "REAL");
    await addColumnIfMissing("poster_mockups", "foreground_opacity_override", "REAL");

    logger.info("Mockup layers migration completed");
  } catch (err) {
    logger.error({ err }, "Mockup layers migration failed");
  } finally {
    client.release();
  }
}
