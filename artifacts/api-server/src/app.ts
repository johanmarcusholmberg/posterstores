import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import stripeRouter from "./routes/stripe";
import { stripeWebhookHandler } from "./routes/stripeWebhook";
import { logger } from "./lib/logger";
import { seedMockupTemplates } from "./routes/mockups";
import { migrateExistingPosterSizes } from "./lib/migrateExistingPosterSizes";
import { migrateSlugField } from "./lib/migrateSlugField";
import { migrateUserAuth } from "./lib/migrateUserAuth";
import { migrateShipping } from "./lib/migrateShipping";
import { migrateMockupPlacement } from "./lib/migrateMockupPlacement";
import { migrateCompositingSettings } from "./lib/migrateCompositingSettings";
import { migrateHoverMockup } from "./lib/migrateHoverMockup";
import { migrateStoreLogo } from "./lib/migrateStoreLogo";
import { migrateHomepageVisual } from "./lib/migrateHomepageVisual";
import { migrateTypographyConfig } from "./lib/migrateTypographyConfig";
import { migrateDisplayTitle } from "./lib/migrateDisplayTitle";
import { seedPostsofSpain } from "./lib/seedPostsofSpain";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

function buildCorsOrigins(): string[] | true {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === "") {
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "ALLOWED_ORIGINS is not set in production — CORS will block all cross-origin requests. " +
          "Set ALLOWED_ORIGINS to a comma-separated list of your public domain(s)."
      );
      return [];
    }
    return true;
  }
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

const corsOrigins = buildCorsOrigins();

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

app.use("/__mockup", (_req: Request, res: Response, _next: NextFunction) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  _next();
});
app.use(cookieParser());

app.post("/api/stripe/webhook", (req, _res, next) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    req.body = Buffer.concat(chunks);
    next();
  });
  req.on("error", next);
}, stripeWebhookHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", stripeRouter);
app.use("/api", router);

seedPostsofSpain().catch((err) =>
  logger.error(err, "Failed to seed PostsofSpain store")
);

migrateSlugField()
  .then(() => migrateExistingPosterSizes())
  .then(() => migrateUserAuth())
  .then(() => migrateShipping())
  .then(() => migrateMockupPlacement())
  .then(() => migrateCompositingSettings())
  .then(() => migrateHoverMockup())
  .then(() => migrateStoreLogo())
  .then(() => migrateHomepageVisual())
  .then(() => migrateTypographyConfig())
  .then(() => migrateDisplayTitle())
  .then(() => seedMockupTemplates())
  .catch((err) =>
    logger.error(err, "Failed to run startup migrations")
  );

export default app;
