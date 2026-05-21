import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateMockupPlacement(): Promise<void> {
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

    await addColumnIfMissing("mockup_templates", "source_image_width", "INTEGER");
    await addColumnIfMissing("mockup_templates", "source_image_height", "INTEGER");

    logger.info("Mockup placement migration completed");
  } catch (err) {
    logger.error({ err }, "Mockup placement migration failed");
  } finally {
    client.release();
  }
}
