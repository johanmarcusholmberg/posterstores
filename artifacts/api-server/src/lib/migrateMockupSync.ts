import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateMockupSync(): Promise<void> {
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

    // Template intent flags
    await addColumnIfMissing("mockup_templates", "can_be_primary", "BOOLEAN NOT NULL DEFAULT TRUE");
    await addColumnIfMissing("mockup_templates", "can_be_hover", "BOOLEAN NOT NULL DEFAULT FALSE");
    await addColumnIfMissing("mockup_templates", "can_be_gallery", "BOOLEAN NOT NULL DEFAULT TRUE");

    // Poster mockup sync fields
    await addColumnIfMissing("poster_mockups", "is_gallery", "BOOLEAN NOT NULL DEFAULT TRUE");
    await addColumnIfMissing("poster_mockups", "status", "TEXT NOT NULL DEFAULT 'manual'");
    await addColumnIfMissing("poster_mockups", "generated_at", "TIMESTAMPTZ");
    await addColumnIfMissing("poster_mockups", "error_message", "TEXT");

    // Unique partial index to prevent duplicate (poster_id, template_id) pairs
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS poster_mockups_poster_template_unique
      ON poster_mockups (poster_id, mockup_template_id)
      WHERE mockup_template_id IS NOT NULL
    `);

    logger.info("Mockup sync migration completed");
  } catch (err) {
    logger.error({ err }, "Mockup sync migration failed");
  } finally {
    client.release();
  }
}
