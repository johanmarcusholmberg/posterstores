import { Router } from "express";
import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

const COOKIE_NAME = "auth_token";
const SESSION_DAYS = 30;
const SALT_ROUNDS = 10;

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === "production",
};

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function createSession(userId: number): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query(
      "INSERT INTO user_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
      [token, userId, expiresAt]
    );
    return token;
  } finally {
    client.release();
  }
}

router.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
  }

  const { email, password } = parsed.data;
  const client = await pool.connect();
  try {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await client.query<{ id: number; is_admin: boolean }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, is_admin",
      [email.toLowerCase(), passwordHash]
    );

    const row = result.rows[0];
    const token = await createSession(row.id);
    res.cookie(COOKIE_NAME, token, cookieOpts);
    return res.status(201).json({ user: { id: row.id, email: email.toLowerCase(), isAdmin: row.is_admin } });
  } finally {
    client.release();
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password" });
  }

  const { email, password } = parsed.data;
  const client = await pool.connect();
  try {
    const result = await client.query<{ id: number; password_hash: string; is_admin: boolean }>(
      "SELECT id, password_hash, is_admin FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = await createSession(user.id);
    res.cookie(COOKIE_NAME, token, cookieOpts);
    return res.json({ user: { id: user.id, email: email.toLowerCase(), isAdmin: user.is_admin } });
  } finally {
    client.release();
  }
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (token) {
    const client = await pool.connect();
    try {
      await client.query("DELETE FROM user_sessions WHERE token = $1", [token]);
    } finally {
      client.release();
    }
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
});

router.get("/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
