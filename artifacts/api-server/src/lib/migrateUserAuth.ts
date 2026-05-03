import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrateUserAuth(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        expires_at TIMESTAMP NOT NULL
      )
    `);

    const hasSessCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'favorites' AND column_name = 'session_id'
    `);

    if (hasSessCol.rows.length > 0) {
      await client.query(`DELETE FROM favorites`);

      await client.query(`ALTER TABLE favorites DROP COLUMN IF EXISTS session_id`);
    }

    const hasUserCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'favorites' AND column_name = 'user_id'
    `);

    if (hasUserCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE favorites
        ADD COLUMN user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
      `);
    }

    const hasOldConstraint = await client.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'favorites'
        AND constraint_type = 'UNIQUE'
        AND constraint_name NOT LIKE '%user_id%'
    `);

    for (const row of hasOldConstraint.rows) {
      await client.query(`ALTER TABLE favorites DROP CONSTRAINT IF EXISTS "${row.constraint_name}"`);
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_id_poster_id_unique
      ON favorites (user_id, poster_id)
    `);

    logger.info("User auth migration completed");
  } catch (err) {
    logger.error(err, "User auth migration failed");
  } finally {
    client.release();
  }
}
