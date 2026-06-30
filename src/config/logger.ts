import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "./env";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.body.password",
      "req.body.accessToken",
      "req.body.appSecret",
      "req.body.refreshToken",
    ],
    censor: "[REDACTED]",
  },
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === "/health" },
});
