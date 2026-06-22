import { Router } from "express";
import { db } from "@workspace/db";
import { mockupTemplatesTable } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../lib/objectStorage";
import { randomUUID } from "crypto";
import { z } from "zod";

const router = Router();
const storage = new ObjectStorageService();

function generateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

const GenerateBody = z.object({
  prompt: z.string().min(5).max(1000),
  name: z.string().min(1).max(120).optional(),
  category: z.string().optional(),
  storeKey: z.string().optional().nullable(),
  size: z.enum(["1024x1024", "512x512", "256x256"]).optional(),
});

router.post(
  "/mockup-templates/generate",
  adminLimiter,
  requireAdmin,
  async (req, res) => {
    const parsed = GenerateBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    }

    const { prompt, name, category, storeKey, size = "1024x1024" } = parsed.data;

    req.log.info({ event: "generate_mockup_template" }, "Generating mockup template image");

    try {
      const imageBuffer = await generateImageBuffer(prompt, size);

      const fileName = `generated-${randomUUID().slice(0, 8)}.png`;
      const subPath = `mockup-templates/generated/${fileName}`;
      const objectPath = await storage.uploadBuffer(subPath, imageBuffer, "image/png");
      const imageUrl = `/api/storage${objectPath}`;

      const templateName = name ?? `Generated mockup ${new Date().toISOString().slice(0, 10)}`;
      const templateKey = `generated-${generateKey(templateName)}-${randomUUID().slice(0, 6)}`;

      const [template] = await db
        .insert(mockupTemplatesTable)
        .values({
          name: templateName,
          templateKey,
          backgroundImageUrl: imageUrl,
          storagePath: objectPath,
          category: category ?? null,
          storeKey: storeKey ?? null,
          active: false,
          isFeatured: false,
          canBePrimary: true,
          canBeHover: false,
          canBeGallery: true,
          frameType: "none",
          description: `Generated from prompt: ${prompt.slice(0, 200)}`,
        })
        .returning();

      req.log.info({ templateId: template.id, event: "generate_mockup_template" }, "Mockup template generated successfully");

      return res.status(201).json({
        template,
        note: "Template created as inactive. Review and set placement before activating.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Image generation failed";
      req.log.error({ err, event: "generate_mockup_template" }, "Failed to generate mockup template");
      return res.status(500).json({ error: msg });
    }
  }
);

export default router;
