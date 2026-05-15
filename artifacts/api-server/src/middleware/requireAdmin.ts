import { Request, Response, NextFunction } from "express";
import { adminLimiter } from "./rateLimiter";
import { adminSessionStore } from "../routes/adminAuth";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  adminLimiter(req, res, () => {
    const sessionId = req.cookies?.admin_session as string | undefined;
    if (sessionId) {
      const session = adminSessionStore.get(sessionId);
      if (session && session.expiresAt > Date.now()) {
        next();
        return;
      }
      if (session) adminSessionStore.delete(sessionId);
    }
    res.status(401).json({ error: "Unauthorized" });
  });
}
