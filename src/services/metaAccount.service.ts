import { prisma } from "../config/prisma";
import { encryptToken } from "../utils/crypto";
import { AppError } from "../utils/AppError";
import { ConnectMetaAccountInput } from "../utils/schemas/metaAccount.schema";

export async function connectMetaAccount(userId: string, input: ConnectMetaAccountInput) {
  const existing = await prisma.metaAccount.findUnique({
    where: { metaAdAccountId: input.metaAdAccountId },
  });
  if (existing) {
    throw new AppError("This Meta ad account is already connected", 409);
  }

  const accessTokenEnc = encryptToken(input.accessToken);

  const account = await prisma.metaAccount.create({
    data: {
      userId,
      metaAdAccountId: input.metaAdAccountId,
      externalCustomerId: input.externalCustomerId,
      businessName: input.businessName,
      accessTokenEncrypted: accessTokenEnc.ciphertext,
      accessTokenIv: accessTokenEnc.iv,
      accessTokenAuthTag: accessTokenEnc.authTag,
      tokenExpiresAt: input.tokenExpiresAt,
    },
  });

  return sanitizeMetaAccount(account);
}

interface OAuthAdAccountSummary {
  id: string; // Meta's act_<id>
  name: string;
}

// Persists every ad account the user authorized during the OAuth dialog,
// encrypting the shared long-lived token for each row. Accounts already
// connected by this same user just get their token refreshed; accounts
// already owned by a different user are skipped rather than overwritten.
export async function persistMetaAccountsFromOAuth(
  userId: string,
  metaAppId: string,
  facebookUserId: string,
  adAccounts: OAuthAdAccountSummary[],
  accessToken: string,
  expiresInSeconds?: number,
  externalCustomerId?: string
) {
  const accessTokenEnc = encryptToken(accessToken);
  const tokenExpiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000)
    : undefined;

  const results = [];
  for (const adAccount of adAccounts) {
    const existing = await prisma.metaAccount.findUnique({
      where: { metaAdAccountId: adAccount.id },
    });

    if (existing && existing.userId !== userId) {
      continue; // owned by someone else — don't hijack it
    }

    const saved = await prisma.metaAccount.upsert({
      where: { metaAdAccountId: adAccount.id },
      create: {
        userId,
        metaAppId,
        facebookUserId,
        externalCustomerId,
        metaAdAccountId: adAccount.id,
        businessName: adAccount.name,
        accessTokenEncrypted: accessTokenEnc.ciphertext,
        accessTokenIv: accessTokenEnc.iv,
        accessTokenAuthTag: accessTokenEnc.authTag,
        tokenExpiresAt,
      },
      update: {
        metaAppId,
        facebookUserId,
        ...(externalCustomerId ? { externalCustomerId } : {}),
        businessName: adAccount.name,
        accessTokenEncrypted: accessTokenEnc.ciphertext,
        accessTokenIv: accessTokenEnc.iv,
        accessTokenAuthTag: accessTokenEnc.authTag,
        tokenExpiresAt,
        isActive: true,
      },
    });
    results.push(sanitizeMetaAccount(saved));
  }

  return results;
}

// Called when Meta tells us (via the deauthorize webhook) or we discover
// (via a 401/expired-token response) that a connection is no longer usable.
export async function deactivateMetaAccountsForFacebookUser(metaAppId: string, facebookUserId: string) {
  const result = await prisma.metaAccount.updateMany({
    where: { metaAppId, facebookUserId },
    data: { isActive: false },
  });
  return result.count;
}

export async function deactivateMetaAccount(metaAccountId: string) {
  await prisma.metaAccount.update({ where: { id: metaAccountId }, data: { isActive: false } });
}

export async function listMetaAccounts(userId: string, externalCustomerId?: string) {
  const accounts = await prisma.metaAccount.findMany({
    where: { userId, ...(externalCustomerId ? { externalCustomerId } : {}) },
  });
  return accounts.map(sanitizeMetaAccount);
}

export async function getOwnedMetaAccount(userId: string, metaAccountId: string) {
  const account = await prisma.metaAccount.findFirst({
    where: { id: metaAccountId, userId },
  });
  if (!account) {
    throw new AppError("Meta account not found", 404);
  }
  return account;
}

export async function getOwnedMetaAccountByAdAccountId(userId: string, metaAdAccountId: string) {
  const account = await prisma.metaAccount.findFirst({
    where: { metaAdAccountId, userId },
  });
  if (!account) {
    throw new AppError("Meta account not found for this act_xxx ID", 404);
  }
  return account;
}

// Strips encrypted token material before returning to clients.
function sanitizeMetaAccount(account: {
  accessTokenEncrypted: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
  [key: string]: unknown;
}) {
  const {
    accessTokenEncrypted: _ate,
    accessTokenIv: _aiv,
    accessTokenAuthTag: _aat,
    ...safe
  } = account;
  return safe;
}
