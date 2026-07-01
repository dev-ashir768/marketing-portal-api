import { prisma } from "../config/prisma";
import { CampaignStatus, CampaignObjective } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { getOwnedMetaAccount } from "./metaAccount.service";
import { MetaAccountClient } from "./meta.service";
import { CreateCampaignInput, UpdateCampaignInput } from "../utils/schemas/campaign.schema";

export async function createCampaign(userId: string, input: CreateCampaignInput) {
  const metaAccount = await getOwnedMetaAccount(userId, input.metaAccountId);

  const campaign = await prisma.adCampaign.create({
    data: {
      metaAccountId: metaAccount.id,
      name: input.name,
      objective: input.objective,
      status: input.status,
      dailyBudgetCents: input.dailyBudgetCents,
      lifetimeBudgetCents: input.lifetimeBudgetCents,
      startTime: input.startTime,
      endTime: input.endTime,
    },
  });

  // Push to Meta only once the campaign is meant to go live; DRAFT stays local-only.
  if (campaign.status === "ACTIVE" || campaign.status === "PAUSED") {
    const client = new MetaAccountClient(metaAccount);
    const metaCampaign = await client.createCampaign({
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      dailyBudgetCents: campaign.dailyBudgetCents ?? undefined,
    });

    return prisma.adCampaign.update({
      where: { id: campaign.id },
      data: { metaCampaignId: metaCampaign.id },
    });
  }

  return campaign;
}

export async function listCampaigns(userId: string, metaAccountId?: string) {
  return prisma.adCampaign.findMany({
    where: {
      metaAccount: { userId },
      ...(metaAccountId ? { metaAccountId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.adCampaign.findFirst({
    where: { id: campaignId, metaAccount: { userId } },
  });
  if (!campaign) {
    throw new AppError("Campaign not found", 404);
  }
  return campaign;
}

export async function updateCampaign(userId: string, campaignId: string, input: UpdateCampaignInput) {
  await getCampaign(userId, campaignId);
  return prisma.adCampaign.update({ where: { id: campaignId }, data: input });
}

export async function deleteCampaign(userId: string, campaignId: string) {
  await getCampaign(userId, campaignId);
  await prisma.adCampaign.delete({ where: { id: campaignId } });
}

// Pulls all campaigns from Meta for a given ad account and upserts them
// into the DB — so existing Meta Ads Manager campaigns appear here too,
// and any new ones published on Meta side are picked up on the next sync.
export async function syncCampaignsFromMeta(userId: string, metaAccountId: string) {
  const metaAccount = await getOwnedMetaAccount(userId, metaAccountId);
  const client = new MetaAccountClient(metaAccount);
  const metaCampaigns = await client.syncCampaigns();

  const validStatuses = Object.values(CampaignStatus);
  const validObjectives = Object.values(CampaignObjective);

  const upserts = metaCampaigns.map((c) => {
    const status = (validStatuses.includes(c.status as CampaignStatus) ? c.status : "PAUSED") as CampaignStatus;
    const objective = (validObjectives.includes(c.objective as CampaignObjective) ? c.objective : "OUTCOME_TRAFFIC") as CampaignObjective;
    return prisma.adCampaign.upsert({
      where: { metaCampaignId: c.id },
      update: {
        name: c.name,
        status,
        dailyBudgetCents: c.daily_budget ? parseInt(c.daily_budget) : null,
        lifetimeBudgetCents: c.lifetime_budget ? parseInt(c.lifetime_budget) : null,
        startTime: c.start_time ? new Date(c.start_time) : null,
        endTime: c.stop_time ? new Date(c.stop_time) : null,
      },
      create: {
        metaAccountId: metaAccount.id,
        metaCampaignId: c.id,
        name: c.name,
        objective,
        status,
        dailyBudgetCents: c.daily_budget ? parseInt(c.daily_budget) : null,
        lifetimeBudgetCents: c.lifetime_budget ? parseInt(c.lifetime_budget) : null,
        startTime: c.start_time ? new Date(c.start_time) : null,
        endTime: c.stop_time ? new Date(c.stop_time) : null,
      },
    });
  });

  await Promise.all(upserts);
  return { synced: metaCampaigns.length };
}
