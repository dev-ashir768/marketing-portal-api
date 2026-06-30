import cors, { CorsOptions } from "cors";
import { env } from "./env";
import { prisma } from "./prisma";

const PORTAL_CACHE_TTL_MS = 60_000;
let cachedPortalOrigins: Set<string> = new Set();
let cacheExpiresAt = 0;

// Each white-labeled client's own portalUrl is a valid CORS origin. Rather than
// querying the DB on every preflight, refresh a small in-memory set periodically.
async function getAllowedPortalOrigins(): Promise<Set<string>> {
  if (Date.now() < cacheExpiresAt) {
    return cachedPortalOrigins;
  }

  const users = await prisma.user.findMany({
    where: { portalUrl: { not: null } },
    select: { portalUrl: true },
  });

  cachedPortalOrigins = new Set(users.map((u) => u.portalUrl).filter((url): url is string => !!url));
  cacheExpiresAt = Date.now() + PORTAL_CACHE_TTL_MS;
  return cachedPortalOrigins;
}

const corsOptions: CorsOptions = {
  origin: async (origin, callback) => {
    // No Origin header (server-to-server calls, curl, Postman without browser) — allow.
    if (!origin) return callback(null, true);

    if (env.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    const portalOrigins = await getAllowedPortalOrigins();
    if (portalOrigins.has(origin)) {
      return callback(null, true);
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
  },
  credentials: true,
};

export const corsMiddleware = cors(corsOptions);
