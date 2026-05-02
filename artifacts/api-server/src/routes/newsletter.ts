import { Router } from "express";
import { db } from "@workspace/db";
import { newsletterTable } from "@workspace/db";
import { SubscribeNewsletterBody } from "@workspace/api-zod";

const router = Router();

router.post("/newsletter", async (req, res) => {
  const body = SubscribeNewsletterBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { email, storeKey } = body.data;

  await db
    .insert(newsletterTable)
    .values({ email, storeKey })
    .onConflictDoNothing();

  return res.json({ success: true, message: "You're on the list! Expect beautiful things soon." });
});

export default router;
