import { z } from "zod";

// Skip loading .env in tests — test files set required vars directly
// (see tests/setup.ts) so a half-filled local .env can't leak in and break them.
if (process.env.NODE_ENV !== "test") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv/config");
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)"),
  // No platform-wide META_APP_ID/SECRET — each user registers their own Meta App
  // (see MetaApp model) and OAuth runs under that app's identity.
  META_API_VERSION: z.string().default("v21.0"),
  // Single shared callback URL; each user adds it to their own Meta App's allowed redirect URIs.
  META_OAUTH_REDIRECT_URI: z.string().url("META_OAUTH_REDIRECT_URI must be a full URL"),
  // Fallback OAuth redirect target, used only when a client hasn't set their own
  // User.portalUrl yet (each white-labeled client normally has their own portal).
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  // Comma-separated list of additional allowed CORS origins (e.g. an internal admin
  // dashboard) on top of each client's own User.portalUrl, which is allowed dynamically.
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((s) => s.trim()).filter(Boolean)),
  // Optional — error monitoring only activates if this is set. Treat an empty
  // string (e.g. a blank .env line) the same as unset rather than a validation error.
  SENTRY_DSN: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().url().optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
