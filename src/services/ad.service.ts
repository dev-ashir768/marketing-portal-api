import { prisma } from "../config/prisma";
import { AdStatus } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { MetaAccountClient } from "./meta.service";

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
  return prisma.ad.update({ where: { id: adId }, data: input });
}

export async function deleteAd(userId: string, adId: string, externalCustomerId?: string) {
  await getAd(userId, adId, externalCustomerId);
  await prisma.ad.delete({ where: { id: adId } });
}
