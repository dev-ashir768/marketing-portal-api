import express, { Application } from "express";
import helmet from "helmet";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { corsMiddleware } from "./config/cors";
import { globalRateLimiter, authRateLimiter } from "./middlewares/rateLimit.middleware";
import { httpLogger } from "./config/logger";

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(httpLogger);
  app.use(globalRateLimiter);

  app.get("/health", (_req, res) => res.status(200).json({ success: true, data: { status: "ok" } }));

  app.use("/api/v1/auth/login", authRateLimiter);
  app.use("/api/v1/auth/register", authRateLimiter);
  app.use("/api/v1", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
