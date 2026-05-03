import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAdmin } from "../middleware/requireAdmin";
import { z } from "zod";

const router: IRouter = Router();

const AnalyzePlacementBody = z.object({
  imageUrl: z.string().url(),
});

const SYSTEM_PROMPT = `You are an expert computer vision assistant for a poster print shop.
Your task is to analyze a mockup background image and identify the rectangular area where a poster or artwork print should be placed.

Look for:
- A picture frame (with visible frame border)
- An empty canvas, whiteboard, or board on a wall
- A designated art display area
- A mat or mount opening
- A wall space clearly intended to display artwork

Return ONLY a JSON object with these fields (values as percentages of image dimensions, 0-100):
{
  "x": <left edge of poster area as % of image width>,
  "y": <top edge of poster area as % of image height>,
  "width": <width of poster area as % of image width>,
  "height": <height of poster area as % of image height>,
  "rotation": <clockwise rotation in degrees, 0 if not tilted>,
  "confidence": <0-1, how confident you are>,
  "description": <one sentence describing what you found>
}

If you cannot find a clear placement area, return:
{"confidence": 0, "description": "No clear poster placement area detected"}

Be precise — the goal is to accurately overlay a poster image on top of this background without covering the frame.`;

router.post(
  "/mockup-templates/analyze-placement",
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = AnalyzePlacementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "imageUrl is required and must be a valid URL" });
      return;
    }

    const { imageUrl } = parsed.data;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        max_completion_tokens: 512,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: "Analyze this mockup background image and identify the poster placement area. Return only the JSON object.",
              },
            ],
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "";

      // Extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        req.log.warn({ raw }, "No JSON found in vision response");
        res.status(422).json({ error: "Could not parse placement from image", raw });
        return;
      }

      let placement: Record<string, unknown>;
      try {
        placement = JSON.parse(jsonMatch[0]);
      } catch {
        res.status(422).json({ error: "Invalid JSON in vision response", raw });
        return;
      }

      const confidence = typeof placement.confidence === "number" ? placement.confidence : 0;

      if (confidence === 0) {
        res.json({
          detected: false,
          confidence: 0,
          description: placement.description ?? "No placement area found",
        });
        return;
      }

      res.json({
        detected: true,
        confidence,
        description: placement.description,
        x: typeof placement.x === "number" ? Math.round(placement.x * 10) / 10 : null,
        y: typeof placement.y === "number" ? Math.round(placement.y * 10) / 10 : null,
        width: typeof placement.width === "number" ? Math.round(placement.width * 10) / 10 : null,
        height: typeof placement.height === "number" ? Math.round(placement.height * 10) / 10 : null,
        rotation: typeof placement.rotation === "number" ? placement.rotation : 0,
      });
    } catch (error) {
      req.log.error({ err: error }, "Error analyzing mockup placement");
      res.status(500).json({ error: "Failed to analyze image" });
    }
  }
);

export default router;
