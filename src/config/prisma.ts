import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// Reuse a single PrismaClient across hot reloads in dev to avoid exhausting DB connections.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
