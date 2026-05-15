import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { adminLimiter } from "../middleware/rateLimiter";
import { logger } from "../lib/logger";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface AdminSession {
  expiresAt: number;
}

export const adminSessionStore = new Map<string, AdminSession>();

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of adminSessionStore) {
    if (session.expiresAt <= now) {
      adminSessionStore.delete(id);
    }
  }
}

setInterval(pruneExpiredSessions, 60 * 60 * 1000).unref();

const router = Router();

router.post("/admin/login", adminLimiter, (req: Request, res: Response) => {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    res.status(500).json({ error: "Admin authentication is not configured" });
    return;
  }

  const { token } = req.body as { token?: string };
  if (!token || token !== expectedToken) {
    res.status(401).json({ error: "Invalid admin token" });
    return;
  }

  pruneExpiredSessions();

  const sessionId = randomUUID();
  adminSessionStore.set(sessionId, { expiresAt: Date.now() + SESSION_TTL_MS });

  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("admin_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: SESSION_TTL_MS,
  });

  logger.info("Admin session created");
  res.json({ ok: true });
});

router.post("/admin/logout", (req: Request, res: Response) => {
  const sessionId = req.cookies?.admin_session as string | undefined;
  if (sessionId) {
    adminSessionStore.delete(sessionId);
  }
  const isProductionClear = process.env.NODE_ENV === "production";
  res.clearCookie("admin_session", { httpOnly: true, sameSite: "lax", secure: isProductionClear, path: "/" });
  logger.info("Admin session cleared");
  res.json({ ok: true });
});

router.get("/admin/session", (req: Request, res: Response) => {
  const sessionId = req.cookies?.admin_session as string | undefined;
  if (sessionId) {
    const session = adminSessionStore.get(sessionId);
    if (session) {
      if (session.expiresAt > Date.now()) {
        res.json({ authenticated: true });
        return;
      }
      adminSessionStore.delete(sessionId);
    }
  }
  res.status(401).json({ authenticated: false });
});

export default router;
