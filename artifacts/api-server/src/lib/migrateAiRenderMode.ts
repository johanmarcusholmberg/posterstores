import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateAiRenderMode(): Promise<void> {
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

    // mockup_templates: render mode fields
    await addColumnIfMissing("mockup_templates", "render_mode", "TEXT NOT NULL DEFAULT 'deterministic'");
    await addColumnIfMissing("mockup_templates", "ai_render_prompt", "TEXT");
    await addColumnIfMissing("mockup_templates", "ai_render_requires_review", "BOOLEAN NOT NULL DEFAULT TRUE");

    // poster_mockups: per-mockup render tracking
    await addColumnIfMissing("poster_mockups", "render_mode", "TEXT NOT NULL DEFAULT 'deterministic'");
    await addColumnIfMissing("poster_mockups", "needs_review", "BOOLEAN NOT NULL DEFAULT FALSE");
    await addColumnIfMissing("poster_mockups", "ai_render_warning", "TEXT");
    await addColumnIfMissing("poster_mockups", "source_poster_image_url", "TEXT");
    await addColumnIfMissing("poster_mockups", "source_template_image_url", "TEXT");
    await addColumnIfMissing("poster_mockups", "approved_for_public", "BOOLEAN NOT NULL DEFAULT FALSE");

    logger.info("AI render mode migration completed");
  } catch (err) {
    logger.error({ err }, "AI render mode migration failed");
  } finally {
    client.release();
  }
}
