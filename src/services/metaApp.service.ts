import { prisma } from "../config/prisma";
import { encryptToken, decryptToken } from "../utils/crypto";
import { AppError } from "../utils/AppError";
import { CreateMetaAppInput } from "../utils/schemas/metaApp.schema";
import { verifyMetaAppCredentials } from "./metaOAuth.service";

export async function createMetaApp(userId: string, input: CreateMetaAppInput) {
  const existing = await prisma.metaApp.findUnique({ where: { appId: input.appId } });
  if (existing) {
    throw new AppError("This Meta App ID is already registered", 409);
  }

  // Eagerly verify the appId/appSecret pair is real before storing anything —
  // catches typos/fake credentials immediately instead of failing silently
  // until the user tries to OAuth-connect an ad account weeks later.
  const isValid = await verifyMetaAppCredentials(input.appId, input.appSecret);
  if (!isValid) {
    throw new AppError(
      "Meta rejected this App ID / App Secret combination. Double-check both values in your Meta App Dashboard.",
      400
    );
  }

  const secretEnc = encryptToken(input.appSecret);

  const app = await prisma.metaApp.create({
    data: {
      userId,
      appId: input.appId,
      label: input.label,
      appSecretEncrypted: secretEnc.ciphertext,
      appSecretIv: secretEnc.iv,
      appSecretAuthTag: secretEnc.authTag,
    },
  });

  return sanitizeMetaApp(app);
}

export async function listMetaApps(userId: string) {
  const apps = await prisma.metaApp.findMany({ where: { userId } });
  return apps.map(sanitizeMetaApp);
}

// Returns the raw row (including encrypted secret) for internal OAuth use only —
// never expose this directly over the API.
export async function getOwnedMetaApp(userId: string, metaAppId: string) {
  const app = await prisma.metaApp.findFirst({ where: { id: metaAppId, userId, isActive: true } });
  if (!app) {
    throw new AppError("Meta App not found", 404);
  }
  return app;
}

// Used only by the public deauthorize webhook, which is identified by metaAppId
// in the callback URL path rather than a logged-in user — no ownership check.
export async function getMetaAppById(metaAppId: string) {
  const app = await prisma.metaApp.findUnique({ where: { id: metaAppId } });
  if (!app) {
    throw new AppError("Meta App not found", 404);
  }
  return app;
}

export function decryptMetaAppSecret(app: {
  appSecretEncrypted: string;
  appSecretIv: string;
  appSecretAuthTag: string;
}): string {
  return decryptToken({
    ciphertext: app.appSecretEncrypted,
    iv: app.appSecretIv,
    authTag: app.appSecretAuthTag,
  });
}

function sanitizeMetaApp(app: {
  appSecretEncrypted: string;
  appSecretIv: string;
  appSecretAuthTag: string;
  [key: string]: unknown;
}) {
  const { appSecretEncrypted: _se, appSecretIv: _siv, appSecretAuthTag: _sat, ...safe } = app;
  return safe;
}
