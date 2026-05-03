import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";
import { logger } from "./logger";

const ADMIN_EMAIL = "johanmarcusholmberg@gmail.com";
const ADMIN_INITIAL_PASSWORD = "PostsOfSpain1!";

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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
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

    const adminExists = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [ADMIN_EMAIL]
    );

    if (adminExists.rows.length === 0) {
      const passwordHash = await bcrypt.hash(ADMIN_INITIAL_PASSWORD, 10);
      await client.query(
        "INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, TRUE)",
        [ADMIN_EMAIL, passwordHash]
      );
      logger.info({ email: ADMIN_EMAIL }, "Admin account created");
    } else {
      await client.query(
        "UPDATE users SET is_admin = TRUE WHERE email = $1",
        [ADMIN_EMAIL]
      );
    }

    logger.info("User auth migration completed");
  } catch (err) {
    logger.error(err, "User auth migration failed");
  } finally {
    client.release();
  }
}
