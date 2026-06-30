import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { captureException } from "../config/sentry";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { message: "Validation failed", details: err.flatten() },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const statusCode = err.code === "P2025" ? 404 : 409;
    res.status(statusCode).json({
      success: false,
      error: { message: "Database request failed", code: err.code },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, details: err.details },
    });
    return;
  }

  logger.error({ err }, "Unhandled error");
  captureException(err);
  res.status(500).json({
    success: false,
    error: {
      message: "Internal server error",
      stack: env.NODE_ENV === "development" && err instanceof Error ? err.stack : undefined,
    },
  });
}
