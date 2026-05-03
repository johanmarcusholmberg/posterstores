import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

async function getDatabaseStatus(): Promise<{ ok: boolean; latencyMs?: number }> {
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false };
  }
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (_req, res) => {
  const database = await getDatabaseStatus();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "poster-webstore-api",
    database: database.ok
      ? { status: "ok", latencyMs: database.latencyMs }
      : { status: "error" },
  });
});

export default router;
