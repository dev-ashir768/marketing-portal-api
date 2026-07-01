import { prisma } from "../config/prisma";
import { AdStatus } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { MetaAccountClient } from "./meta.service";
import { createAuditLog } from "./audit.service";

const validStatuses = Object.values(AdStatus);

function normalizeStatus(s: string): AdStatus {
  return (validStatuses.includes(s as AdStatus) ? s : "PAUSED") as AdStatus;
}

async function getOwnedAdSet(userId: string, adSetId: string, externalCustomerId?: string) {
  const adSet = await prisma.adSet.findFirst({
    where: {
      id: adSetId,
      metaAccount: { userId, ...(externalCustomerId ? { externalCustomerId } : {}) },
    },
    include: { metaAccount: true },
  });
  if (!adSet) throw new AppError("Ad set not found", 404);
  return adSet;
}

export async function createAd(
  userId: string,
  adSetId: string,
  input: {
    name: string;
    status?: AdStatus;
    creativeId: string; // internal DB creative ID
    externalCustomerId?: string;
  }
) {
  const adSet = await getOwnedAdSet(userId, adSetId, input.externalCustomerId);

  if (!adSet.metaAdSetId) {
    throw new AppError("Ad set has not been synced with Meta — cannot create ad without metaAdSetId", 400);
  }

  // Resolve creative and verify ownership
  const creative = await prisma.adCreative.findFirst({
    where: {
      id: input.creativeId,
      metaAccountId: adSet.metaAccountId,
    },
  });
  if (!creative) throw new AppError("Creative not found or does not belong to this account", 404);
  if (!creative.metaCreativeId) throw new AppError("Creative has not been pushed to Meta yet — no metaCreativeId", 400);

  const client = new MetaAccountClient(adSet.metaAccount);
  const metaResult = await client.createAd({
    metaAdSetId: adSet.metaAdSetId,
    name: input.name,
    status: input.status ?? "PAUSED",
    metaCreativeId: creative.metaCreativeId,
  });

  const ad = await prisma.ad.create({
    data: {
      metaAccountId: adSet.metaAccountId,
      adSetId: adSet.id,
      metaAdId: metaResult.id,
      name: input.name,
      status: input.status ?? "PAUSED",
      creativeId: creative.id,
    },
  });
  await createAuditLog({ userId, externalCustomerId: input.externalCustomerId, action: "CREATE", resource: "AD", resourceId: ad.id, metadata: { name: input.name, adSetId, creativeId: input.creativeId } });
  return ad;
}

export async function syncAds(
  userId: string,
  adSetId: string,
  externalCustomerId?: string
) {
  const adSet = await getOwnedAdSet(userId, adSetId, externalCustomerId);
  if (!adSet.metaAdSetId) {
    throw new AppError("Ad set has not been synced with Meta yet — no metaAdSetId", 400);
  }

  const client = new MetaAccountClient(adSet.metaAccount);
  const metaAds = await client.syncAds(adSet.metaAdSetId);

  const upserts = metaAds.map((a) =>
    prisma.ad.upsert({
      where: { metaAdId: a.id },
      update: { name: a.name, status: normalizeStatus(a.status) },
      create: {
        metaAccountId: adSet.metaAccountId,
        adSetId: adSet.id,
        metaAdId: a.id,
        name: a.name,
        status: normalizeStatus(a.status),
      },
    })
  );

  await Promise.all(upserts);
  return { synced: metaAds.length, adSetId };
}

export async function listAds(
  userId: string,
  adSetId: string,
  filters: { externalCustomerId?: string; page?: number; limit?: number }
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = {
    adSetId,
    metaAccount: { userId, ...(filters.externalCustomerId ? { externalCustomerId: filters.externalCustomerId } : {}) },
  };

  const [total, data] = await Promise.all([
    prisma.ad.count({ where }),
    prisma.ad.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
  ]);

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getAd(userId: string, adId: string, externalCustomerId?: string) {
  const ad = await prisma.ad.findFirst({
    where: {
      id: adId,
      metaAccount: { userId, ...(externalCustomerId ? { externalCustomerId } : {}) },
    },
  });
  if (!ad) throw new AppError("Ad not found", 404);
  return ad;
}

export async function updateAd(
  userId: string,
  adId: string,
  input: { name?: string; status?: AdStatus },
  externalCustomerId?: string
) {
  await getAd(userId, adId, externalCustomerId);
  const updated = await prisma.ad.update({ where: { id: adId }, data: input });
  await createAuditLog({ userId, action: "UPDATE", resource: "AD", resourceId: adId, metadata: input as Record<string, unknown> });
  return updated;
}

export async function deleteAd(userId: string, adId: string, externalCustomerId?: string) {
  const ad = await getAd(userId, adId, externalCustomerId);
  await prisma.ad.delete({ where: { id: adId } });
  await createAuditLog({ userId, action: "DELETE", resource: "AD", resourceId: adId, metadata: { name: ad.name } });
}
