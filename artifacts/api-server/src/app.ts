import express, { type Express } from "express";
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

app.use(cors({
  origin: true,
  credentials: true,
}));
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

seedMockupTemplates().catch((err) =>
  logger.error(err, "Failed to seed mockup templates")
);

migrateSlugField()
  .then(() => migrateExistingPosterSizes())
  .then(() => migrateUserAuth())
  .catch((err) =>
    logger.error(err, "Failed to run startup migrations")
  );

export default app;
