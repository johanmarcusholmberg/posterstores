import { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

export interface AuthUser {
  id: number;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token as string | undefined;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query<{ user_id: number; email: string; expires_at: Date }>(
        `SELECT s.user_id, u.email, s.expires_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = $1`,
        [token]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Session not found" });
      }

      const row = result.rows[0];
      if (new Date() > row.expires_at) {
        await client.query("DELETE FROM user_sessions WHERE token = $1", [token]);
        return res.status(401).json({ error: "Session expired" });
      }

      req.user = { id: row.user_id, email: row.email };
      next();
    } finally {
      client.release();
    }
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token as string | undefined;
  if (!token) {
    return next();
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query<{ user_id: number; email: string; expires_at: Date }>(
        `SELECT s.user_id, u.email, s.expires_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = $1`,
        [token]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        if (new Date() <= row.expires_at) {
          req.user = { id: row.user_id, email: row.email };
        }
      }
    } finally {
      client.release();
    }
  } catch {
    // silently fail optional auth
  }
  next();
}
