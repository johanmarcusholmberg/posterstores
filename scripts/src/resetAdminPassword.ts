import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";

const EMAIL = "johanmarcusholmberg@gmail.com";
const NEW_PASSWORD = "jagtestar2026!!";

const client = await pool.connect();
try {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);

  const result = await client.query(
    "UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email",
    [hash, EMAIL]
  );

  if (result.rowCount === 0) {
    console.error(`No user found with email: ${EMAIL}`);
    process.exit(1);
  }

  console.log(`Password updated for: ${result.rows[0].email} (id=${result.rows[0].id})`);
} finally {
  client.release();
  await pool.end();
}
