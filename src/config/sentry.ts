import * as Sentry from "@sentry/node";
import { env } from "./env";
import { logger } from "./logger";

// No-op unless SENTRY_DSN is configured — keeps local/dev runs dependency-free.
export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 0,
  });
  logger.info("Sentry error monitoring initialized");
}

export function captureException(err: unknown): void {
  if (env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
}
