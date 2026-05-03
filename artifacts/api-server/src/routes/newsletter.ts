import { Router } from "express";
import { db } from "@workspace/db";
import { newsletterTable } from "@workspace/db";
import { SubscribeNewsletterBody } from "@workspace/api-zod";
import { newsletterLimiter } from "../middleware/rateLimiter";

const router = Router();

async function handleSubscribe(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1]) {
  const body = SubscribeNewsletterBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { email, storeKey } = body.data;

  await db
    .insert(newsletterTable)
    .values({ email, storeKey })
    .onConflictDoNothing();

  return res.json({ success: true, message: "You're on the list! Expect beautiful things soon." });
}

router.post("/newsletter", newsletterLimiter, handleSubscribe);

router.post("/newsletter/subscribe", newsletterLimiter, handleSubscribe);

export default router;
