import { prisma } from "../config/prisma";
import { AdSetStatus } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { MetaAccountClient } from "./meta.service";

const validStatuses = Object.values(AdSetStatus);

function normalizeStatus(s: string): AdSetStatus {
  return (validStatuses.includes(s as AdSetStatus) ? s : "PAUSED") as AdSetStatus;
}

async function getOwnedCampaign(userId: string, campaignId: string, externalCustomerId?: string) {
  const campaign = await prisma.adCampaign.findFirst({
    where: {
      id: campaignId,
      metaAccount: { userId, ...(externalCustomerId ? { externalCustomerId } : {}) },
    },
    include: { metaAccount: true },
  });
  if (!campaign) throw new AppError("Campaign not found", 404);
  return campaign;
}

export async function createAdSet(
  userId: string,
  campaignId: string,
  input: {
    name: string;
    status?: AdSetStatus;
    dailyBudgetCents?: number;
    lifetimeBudgetCents?: number;
    billingEvent: string;
    optimizationGoal: string;
    targeting: Record<string, unknown>;
    startTime?: string;
    endTime?: string;
    externalCustomerId?: string;
  }
) {
  const campaign = await getOwnedCampaign(userId, campaignId, input.externalCustomerId);

  if (!campaign.metaCampaignId) {
    throw new AppError("Campaign has not been synced with Meta — cannot create ad set without metaCampaignId", 400);
  }

  const client = new MetaAccountClient(campaign.metaAccount);
  const metaResult = await client.createAdSet({
    metaCampaignId: campaign.metaCampaignId,
    name: input.name,
    status: input.status ?? "PAUSED",
    dailyBudgetCents: input.dailyBudgetCents,
    lifetimeBudgetCents: input.lifetimeBudgetCents,
    billingEvent: input.billingEvent,
    optimizationGoal: input.optimizationGoal,
    targeting: input.targeting,
    startTime: input.startTime,
    endTime: input.endTime,
  });

  return prisma.adSet.create({
    data: {
      metaAccountId: campaign.metaAccountId,
      campaignId: campaign.id,
      metaAdSetId: metaResult.id,
      name: input.name,
      status: input.status ?? "PAUSED",
      dailyBudgetCents: input.dailyBudgetCents ?? null,
      lifetimeBudgetCents: input.lifetimeBudgetCents ?? null,
      startTime: input.startTime ? new Date(input.startTime) : null,
      endTime: input.endTime ? new Date(input.endTime) : null,
    },
  });
}

export async function syncAdSets(
  userId: string,
  campaignId: string,
  externalCustomerId?: string
) {
  const campaign = await getOwnedCampaign(userId, campaignId, externalCustomerId);
  if (!campaign.metaCampaignId) {
    throw new AppError("Campaign has not been synced with Meta yet — no metaCampaignId", 400);
  }

  const client = new MetaAccountClient(campaign.metaAccount);
  const metaAdSets = await client.syncAdSets(campaign.metaCampaignId);

  const upserts = metaAdSets.map((s) =>
    prisma.adSet.upsert({
      where: { metaAdSetId: s.id },
      update: {
        name: s.name,
        status: normalizeStatus(s.status),
        dailyBudgetCents: s.daily_budget ? parseInt(s.daily_budget) : null,
        lifetimeBudgetCents: s.lifetime_budget ? parseInt(s.lifetime_budget) : null,
        startTime: s.start_time ? new Date(s.start_time) : null,
        endTime: s.end_time ? new Date(s.end_time) : null,
      },
      create: {
        metaAccountId: campaign.metaAccountId,
        campaignId: campaign.id,
        metaAdSetId: s.id,
        name: s.name,
        status: normalizeStatus(s.status),
        dailyBudgetCents: s.daily_budget ? parseInt(s.daily_budget) : null,
        lifetimeBudgetCents: s.lifetime_budget ? parseInt(s.lifetime_budget) : null,
        startTime: s.start_time ? new Date(s.start_time) : null,
        endTime: s.end_time ? new Date(s.end_time) : null,
      },
    })
  );

  await Promise.all(upserts);
  return { synced: metaAdSets.length, campaignId };
}

export async function listAdSets(
  userId: string,
  campaignId: string,
  filters: { externalCustomerId?: string; page?: number; limit?: number }
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = {
    campaignId,
    metaAccount: { userId, ...(filters.externalCustomerId ? { externalCustomerId: filters.externalCustomerId } : {}) },
  };

  const [total, data] = await Promise.all([
    prisma.adSet.count({ where }),
    prisma.adSet.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getAdSet(userId: string, adSetId: string, externalCustomerId?: string) {
  const adSet = await prisma.adSet.findFirst({
    where: {
      id: adSetId,
      metaAccount: { userId, ...(externalCustomerId ? { externalCustomerId } : {}) },
    },
  });
  if (!adSet) throw new AppError("Ad set not found", 404);
  return adSet;
}

export async function updateAdSet(
  userId: string,
  adSetId: string,
  input: { name?: string; status?: AdSetStatus; dailyBudgetCents?: number | null; lifetimeBudgetCents?: number | null },
  externalCustomerId?: string
) {
  const adSet = await getAdSet(userId, adSetId, externalCustomerId);

  // Push to Meta if this ad set exists there
  if (adSet.metaAdSetId) {
    const metaAccount = await prisma.metaAccount.findUniqueOrThrow({ where: { id: adSet.metaAccountId } });
    const client = new MetaAccountClient(metaAccount);
    await client.updateAdSet(adSet.metaAdSetId, {
      name: input.name,
      status: input.status,
      dailyBudgetCents: input.dailyBudgetCents,
      lifetimeBudgetCents: input.lifetimeBudgetCents,
    });
  }

  return prisma.adSet.update({ where: { id: adSetId }, data: input });
}

export async function deleteAdSet(userId: string, adSetId: string, externalCustomerId?: string) {
  await getAdSet(userId, adSetId, externalCustomerId);
  await prisma.adSet.delete({ where: { id: adSetId } });
}

// Verify campaign ownership for use by ad service
export { getOwnedCampaign };
