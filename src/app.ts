import express, { Application } from "express";
import helmet from "helmet";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { corsMiddleware } from "./config/cors";
import { globalRateLimiter, authRateLimiter } from "./middlewares/rateLimit.middleware";
import { httpLogger } from "./config/logger";
import { prisma } from "./config/prisma";

export function createApp(): Application {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(httpLogger);
  app.use(globalRateLimiter);

  app.get("/health", async (_req, res) => {
    let dbStatus = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "error";
    }
    const status = dbStatus === "ok" ? "ok" : "degraded";
    res.status(dbStatus === "ok" ? 200 : 503).json({
      success: dbStatus === "ok",
      data: {
        status,
        db: dbStatus,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use("/api/v1/auth/login", authRateLimiter);
  app.use("/api/v1/auth/register", authRateLimiter);
  app.use("/api/v1", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
