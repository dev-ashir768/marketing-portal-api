import { prisma } from "../config/prisma";
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
