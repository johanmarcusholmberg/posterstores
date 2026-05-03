import rateLimit from "express-rate-limit";

const isDev = process.env.NODE_ENV !== "production";

function makeRateLimiter(options: {
  windowMs: number;
  limit: number;
  message: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: options.message },
    skip: () => isDev,
  });
}

export const authLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many attempts, please try again later.",
});

export const checkoutLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many checkout requests, please try again later.",
});

export const newsletterLimiter = makeRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: "Too many newsletter requests, please try again later.",
});

export const adminLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: "Too many admin requests, please try again later.",
});
