import { prisma } from "../config/prisma";
import { CampaignStatus, CampaignObjective } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { getOwnedMetaAccount, getOwnedMetaAccountByAdAccountId } from "./metaAccount.service";
import { MetaAccountClient } from "./meta.service";
import { CreateCampaignInput, UpdateCampaignInput } from "../utils/schemas/campaign.schema";

// Resolves a MetaAccount and enforces ownership by both userId AND externalCustomerId.
// If externalCustomerId is provided, the account must belong to that customer.
async function resolveMetaAccount(
  userId: string,
  lookup: { metaAccountId?: string; metaAdAccountId?: string },
  externalCustomerId?: string
) {
  const account = lookup.metaAccountId
    ? await getOwnedMetaAccount(userId, lookup.metaAccountId)
    : await getOwnedMetaAccountByAdAccountId(userId, lookup.metaAdAccountId!);

  if (externalCustomerId && account.externalCustomerId !== externalCustomerId) {
    throw new AppError("This Meta account does not belong to the specified customer", 403);
  }

  return account;
}

export async function createCampaign(userId: string, input: CreateCampaignInput) {
  const metaAccount = await resolveMetaAccount(
    userId,
    { metaAccountId: input.metaAccountId },
    input.externalCustomerId
  );

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

export async function listCampaigns(
  userId: string,
  filters: {
    metaAccountId?: string;
    metaAdAccountId?: string;
    externalCustomerId?: string;
    page?: number;
    limit?: number;
  }
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = {
    metaAccount: {
      userId,
      ...(filters.externalCustomerId ? { externalCustomerId: filters.externalCustomerId } : {}),
      ...(filters.metaAdAccountId ? { metaAdAccountId: filters.metaAdAccountId } : {}),
    },
    ...(filters.metaAccountId ? { metaAccountId: filters.metaAccountId } : {}),
  };

  const [total, data] = await Promise.all([
    prisma.adCampaign.count({ where }),
    prisma.adCampaign.findMany({
      where,
      include: {
        metaAccount: {
          select: { metaAdAccountId: true, businessName: true, externalCustomerId: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCampaign(userId: string, campaignId: string, externalCustomerId?: string) {
  const campaign = await prisma.adCampaign.findFirst({
    where: {
      id: campaignId,
      metaAccount: {
        userId,
        ...(externalCustomerId ? { externalCustomerId } : {}),
      },
    },
    include: {
      metaAccount: {
        select: {
          metaAdAccountId: true,
          businessName: true,
          externalCustomerId: true,
        },
      },
    },
  });
  if (!campaign) {
    throw new AppError("Campaign not found", 404);
  }
  return campaign;
}

export async function updateCampaign(
  userId: string,
  campaignId: string,
  input: UpdateCampaignInput,
  externalCustomerId?: string
) {
  await getCampaign(userId, campaignId, externalCustomerId);
  return prisma.adCampaign.update({ where: { id: campaignId }, data: input });
}

export async function deleteCampaign(
  userId: string,
  campaignId: string,
  externalCustomerId?: string
) {
  await getCampaign(userId, campaignId, externalCustomerId);
  await prisma.adCampaign.delete({ where: { id: campaignId } });
}

export async function syncCampaignsFromMeta(
  userId: string,
  lookup: { metaAccountId?: string; metaAdAccountId?: string },
  externalCustomerId?: string
) {
  const metaAccount = await resolveMetaAccount(userId, lookup, externalCustomerId);
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
  return {
    synced: metaCampaigns.length,
    metaAdAccountId: metaAccount.metaAdAccountId,
    externalCustomerId: metaAccount.externalCustomerId,
  };
}
