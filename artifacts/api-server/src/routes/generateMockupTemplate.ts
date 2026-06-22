import { Router } from "express";
import { db } from "@workspace/db";
import { mockupTemplatesTable } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../lib/objectStorage";
import { randomUUID } from "crypto";
import { z } from "zod";
import { analyzeMockupPlacement } from "../lib/mockupPlacementAnalyzer";
import { eq } from "drizzle-orm";

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

/**
 * Wrap the user prompt with instructions that make the generated image easier
 * for AI placement detection: empty, clean poster/frame surface, no text,
 * natural lighting, single dominant frame, modest perspective.
 */
function buildGenerationPrompt(userPrompt: string): string {
  return `${userPrompt}

IMPORTANT REQUIREMENTS FOR THIS MOCKUP IMAGE:
- The poster/frame/artwork surface must be EMPTY — no text, no artwork, no imagery inside the frame.
- The poster area should be clearly visible, unobstructed, and clean (white, off-white, or neutral matte).
- Use natural interior lighting with soft shadows that help the frame/surface feel real.
- Include only ONE main poster/frame surface as the dominant element. Avoid multiple competing frames.
- Keep perspective modest — avoid extreme angles. A slight perspective tilt (under 15 degrees) is acceptable.
- The frame or surface boundary should be clearly defined and easy to detect programmatically.
- Realistic interior/room scene. High quality, photorealistic style.`;
}

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
      const enhancedPrompt = buildGenerationPrompt(prompt);
      const imageBuffer = await generateImageBuffer(enhancedPrompt, size);

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
          placementMode: "manual",
          detectedPlacementStatus: "not_analyzed",
        })
        .returning();

      req.log.info({ templateId: template.id, event: "generate_mockup_template" }, "Mockup template generated — running placement analysis");

      // Run placement analysis asynchronously. The template is already saved as
      // inactive. Analysis result will be stored but admin must approve it.
      // We do this in the background and include the result in the response.
      const analysisResult = await analyzeMockupPlacement(imageUrl);
      const now = new Date();

      if (analysisResult.config) {
        const { confidence } = analysisResult.config;
        await db
          .update(mockupTemplatesTable)
          .set({
            detectedPlacementConfig: analysisResult.config as any,
            detectedPlacementStatus: analysisResult.status === "detected" && confidence >= 0.75 ? "detected" : "needs_review",
            detectedPlacementError: null,
            analyzedAt: now,
            placementMode: "auto_detected_needs_review",
            updatedAt: now,
          })
          .where(eq(mockupTemplatesTable.id, template.id));
      } else {
        await db
          .update(mockupTemplatesTable)
          .set({
            detectedPlacementStatus: "failed",
            detectedPlacementError: analysisResult.error ?? "Placement detection failed",
            analyzedAt: now,
            updatedAt: now,
          })
          .where(eq(mockupTemplatesTable.id, template.id));
      }

      const [updatedTemplate] = await db
        .select()
        .from(mockupTemplatesTable)
        .where(eq(mockupTemplatesTable.id, template.id));

      req.log.info(
        { templateId: template.id, analysisStatus: analysisResult.status, event: "generate_mockup_template" },
        "Mockup template generated and analyzed successfully"
      );

      return res.status(201).json({
        template: updatedTemplate,
        placementAnalysis: {
          status: analysisResult.status,
          confidence: analysisResult.confidence,
          warnings: analysisResult.config?.warnings ?? [],
          error: analysisResult.error,
        },
        note: "Template created as inactive. Review detected placement and approve before activating.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Image generation failed";
      req.log.error({ err, event: "generate_mockup_template" }, "Failed to generate mockup template");
      return res.status(500).json({ error: msg });
    }
  }
);

export default router;
