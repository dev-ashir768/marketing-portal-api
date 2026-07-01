import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { MetaAccountClient } from "./meta.service";
import { getOwnedMetaAccount, getOwnedMetaAccountByAdAccountId } from "./metaAccount.service";

export async function getInsights(
  userId: string,
  params: {
    // One of these must be provided
    metaAdAccountId?: string;
    metaAccountId?: string;
    metaCampaignId?: string;
    metaAdSetId?: string;
    metaAdId?: string;
    // Scope
    externalCustomerId?: string;
    // Date range
    datePreset?: string;
    since?: string;
    until?: string;
  }
) {
  // Determine level and objectId from which Meta ID was provided
  let level: "account" | "campaign" | "adset" | "ad" = "account";
  let objectId: string | undefined;

  if (params.metaAdId) {
    level = "ad";
    objectId = params.metaAdId;
    // Verify ownership via the ad row
    const ad = await prisma.ad.findFirst({
      where: { metaAdId: params.metaAdId, metaAccount: { userId, ...(params.externalCustomerId ? { externalCustomerId: params.externalCustomerId } : {}) } },
      include: { metaAccount: true },
    });
    if (!ad) throw new AppError("Ad not found", 404);
    const client = new MetaAccountClient(ad.metaAccount);
    return client.getInsights({ level, objectId, datePreset: params.datePreset, since: params.since, until: params.until });
  }

  if (params.metaAdSetId) {
    level = "adset";
    objectId = params.metaAdSetId;
    const adSet = await prisma.adSet.findFirst({
      where: { metaAdSetId: params.metaAdSetId, metaAccount: { userId, ...(params.externalCustomerId ? { externalCustomerId: params.externalCustomerId } : {}) } },
      include: { metaAccount: true },
    });
    if (!adSet) throw new AppError("Ad set not found", 404);
    const client = new MetaAccountClient(adSet.metaAccount);
    return client.getInsights({ level, objectId, datePreset: params.datePreset, since: params.since, until: params.until });
  }

  if (params.metaCampaignId) {
    level = "campaign";
    objectId = params.metaCampaignId;
    const campaign = await prisma.adCampaign.findFirst({
      where: { metaCampaignId: params.metaCampaignId, metaAccount: { userId, ...(params.externalCustomerId ? { externalCustomerId: params.externalCustomerId } : {}) } },
      include: { metaAccount: true },
    });
    if (!campaign) throw new AppError("Campaign not found", 404);
    const client = new MetaAccountClient(campaign.metaAccount);
    return client.getInsights({ level, objectId, datePreset: params.datePreset, since: params.since, until: params.until });
  }

  // Account-level insights
  const metaAccount = params.metaAccountId
    ? await getOwnedMetaAccount(userId, params.metaAccountId)
    : await getOwnedMetaAccountByAdAccountId(userId, params.metaAdAccountId!);

  if (params.externalCustomerId && metaAccount.externalCustomerId !== params.externalCustomerId) {
    throw new AppError("This Meta account does not belong to the specified customer", 403);
  }

  const client = new MetaAccountClient(metaAccount);
  return client.getInsights({ level: "account", datePreset: params.datePreset, since: params.since, until: params.until });
}
