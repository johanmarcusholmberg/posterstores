import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAdmin } from "../middleware/requireAdmin";
import { z } from "zod";

const router: IRouter = Router();

const DETECTION_MODEL = "gpt-4o";

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isPrivateOrLocalUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname;
    return PRIVATE_IP_PATTERNS.some((re) => re.test(hostname));
  } catch {
    return true;
  }
}

const AnalyzePlacementBody = z.object({
  imageUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
      message: "imageUrl must use http or https",
    }),
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
      res.status(400).json({ error: "imageUrl is required and must be a valid http/https URL" });
      return;
    }

    const { imageUrl } = parsed.data;

    if (isPrivateOrLocalUrl(imageUrl)) {
      req.log.warn({ imageUrl }, "Blocked SSRF attempt to private/local URL");
      res.status(400).json({ error: "Image URL must point to a publicly accessible host" });
      return;
    }

    req.log.info({ imageUrl, event: "mockup_placement_detection" }, "Starting AI placement detection");

    try {
      const response = await openai.chat.completions.create({
        model: DETECTION_MODEL,
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

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        req.log.warn({ raw, event: "mockup_placement_detection", result: "parse_failed" }, "No JSON found in vision response");
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

      req.log.info(
        { confidence, event: "mockup_placement_detection", result: confidence > 0 ? "detected" : "not_detected", model: DETECTION_MODEL },
        "AI placement detection complete"
      );

      if (confidence === 0) {
        res.json({
          detected: false,
          confidence: 0,
          description: placement.description ?? "No placement area found",
          model: DETECTION_MODEL,
        });
        return;
      }

      res.json({
        detected: true,
        confidence,
        description: placement.description,
        model: DETECTION_MODEL,
        x: typeof placement.x === "number" ? Math.round(placement.x * 10) / 10 : null,
        y: typeof placement.y === "number" ? Math.round(placement.y * 10) / 10 : null,
        width: typeof placement.width === "number" ? Math.round(placement.width * 10) / 10 : null,
        height: typeof placement.height === "number" ? Math.round(placement.height * 10) / 10 : null,
        rotation: typeof placement.rotation === "number" ? placement.rotation : 0,
      });
    } catch (error) {
      req.log.error({ err: error, event: "mockup_placement_detection", result: "error" }, "Error analyzing mockup placement");
      res.status(500).json({ error: "Failed to analyze image" });
    }
  }
);

export default router;
