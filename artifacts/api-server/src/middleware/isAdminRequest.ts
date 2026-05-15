import { Request } from "express";
import { adminSessionStore } from "../routes/adminAuth";

export function isAdminRequest(req: Request): boolean {
  const sessionId = req.cookies?.admin_session as string | undefined;
  if (!sessionId) return false;
  const session = adminSessionStore.get(sessionId);
  return !!session && session.expiresAt > Date.now();
}
