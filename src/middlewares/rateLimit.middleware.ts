import rateLimit from "express-rate-limit";

// Generous default for normal API traffic.
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many requests, please try again later" } },
});

// Tight limit on auth endpoints to slow down credential-stuffing/brute-force attempts.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: { message: "Too many auth attempts, please try again later" } },
});
