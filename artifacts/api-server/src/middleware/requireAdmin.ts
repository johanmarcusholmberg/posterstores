import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) {
    res.status(500).json({ error: "ADMIN_API_TOKEN not configured on server" });
    return;
  }
  const provided = req.headers["x-admin-token"];
  if (!provided || provided !== token) {
    res.status(401).json({ error: "Unauthorized: valid X-Admin-Token header required" });
    return;
  }
  next();
}
