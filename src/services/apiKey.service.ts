import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";

const SALT_ROUNDS = 12;

// Generates a new key, replacing any previous one for this user (old key stops
// working immediately — there is only ever one active key per user).
// Returns the plaintext key exactly once; only its hash is ever persisted.
export async function generateApiKey(userId: string): Promise<string> {
  const secret = crypto.randomBytes(32).toString("hex");
  const prefix = `mp_${crypto.randomBytes(6).toString("hex")}`;
  const fullKey = `${prefix}_${secret}`;

  const hash = await bcrypt.hash(fullKey, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { apiKeyPrefix: prefix, apiKeyHash: hash },
  });

  return fullKey;
}

export async function revokeApiKey(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { apiKeyPrefix: null, apiKeyHash: null } });
}

// Resolves a raw "X-API-Key" header value back to the owning user, or throws.
export async function verifyApiKey(rawKey: string) {
  const prefix = rawKey.split("_").slice(0, 2).join("_"); // "mp_<6 bytes hex>"
  if (!prefix.startsWith("mp_")) {
    throw new AppError("Invalid API key", 401);
  }

  const user = await prisma.user.findUnique({ where: { apiKeyPrefix: prefix } });
  if (!user || !user.apiKeyHash) {
    throw new AppError("Invalid API key", 401);
  }

  const matches = await bcrypt.compare(rawKey, user.apiKeyHash);
  if (!matches) {
    throw new AppError("Invalid API key", 401);
  }

  return user;
}
