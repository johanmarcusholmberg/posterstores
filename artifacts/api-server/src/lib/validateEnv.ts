import { logger } from "./logger";

const REQUIRED_PRODUCTION_VARS = [
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "APP_BASE_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_PROVIDER",
  "ADMIN_API_TOKEN",
  "ADMIN_ORDER_NOTIFICATION_EMAIL",
] as const;

const OPTIONAL_IN_DEVELOPMENT = new Set([
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "APP_BASE_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_PROVIDER",
  "ADMIN_ORDER_NOTIFICATION_EMAIL",
]);

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const missing: string[] = [];
  const devWarnings: string[] = [];

  for (const varName of REQUIRED_PRODUCTION_VARS) {
    const value = process.env[varName];
    const isEmpty = !value || value.trim() === "";

    if (isEmpty) {
      if (isProduction || !OPTIONAL_IN_DEVELOPMENT.has(varName)) {
        missing.push(varName);
      } else {
        devWarnings.push(varName);
      }
    }
  }

  if (missing.length > 0) {
    const errorMsg = [
      "Server cannot start: the following required environment variables are missing or empty:",
      ...missing.map((v) => `  - ${v}`),
      "",
      isProduction
        ? "Set these variables in your Replit deployment secrets before publishing."
        : "Set DATABASE_URL and ADMIN_API_TOKEN in your Replit project secrets.",
    ].join("\n");

    logger.fatal({ missing }, "Missing required environment variables");
    console.error(errorMsg);
    process.exit(1);
  }

  if (devWarnings.length > 0) {
    logger.warn(
      { missing: devWarnings },
      "Development mode: some production-only environment variables are not set. " +
        "These must be configured before deploying to production."
    );
  }

  if (isProduction) {
    const adminToken = process.env.ADMIN_API_TOKEN ?? "";
    if (adminToken.length < 32) {
      logger.fatal(
        "ADMIN_API_TOKEN must be at least 32 characters in production. " +
          "Generate one with: openssl rand -hex 32"
      );
      process.exit(1);
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
    if (stripeKey && stripeKey.startsWith("sk_test_")) {
      logger.warn(
        "STRIPE_SECRET_KEY appears to be a test key (sk_test_*) but NODE_ENV is production. " +
          "Use a live key (sk_live_*) for real payments."
      );
    }
  }

  logger.info("Environment validation passed");
}
