import { prisma } from "../config/prisma";
import { CampaignStatus, CampaignObjective } from "@prisma/client";
import { MetaAccountClient } from "../services/meta.service";
import { logger } from "../config/logger";

const validStatuses = Object.values(CampaignStatus);
const validObjectives = Object.values(CampaignObjective);

async function syncAccount(metaAccount: {
  id: string;
  metaAdAccountId: string;
  isActive: boolean;
  tokenExpiresAt: Date | null;
  accessTokenEncrypted: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
}) {
  try {
    const client = new MetaAccountClient(metaAccount as never);
    const metaCampaigns = await client.syncCampaigns();

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
    logger.info({ metaAccountId: metaAccount.id, synced: metaCampaigns.length }, "Campaigns synced");
  } catch (err) {
    logger.warn({ metaAccountId: metaAccount.id, err }, "Sync failed for account — skipping");
  }
}

export async function syncAllCampaigns() {
  const accounts = await prisma.metaAccount.findMany({
    where: { isActive: true },
  });

  logger.info({ total: accounts.length }, "Starting campaign sync job");
  await Promise.allSettled(accounts.map(syncAccount));
  logger.info("Campaign sync job complete");
}

export function startSyncJob(intervalMinutes = 30) {
  // Run once immediately on startup
  syncAllCampaigns().catch((e) => logger.error(e, "Initial campaign sync failed"));

  // Then run every N minutes
  setInterval(() => {
    syncAllCampaigns().catch((e) => logger.error(e, "Scheduled campaign sync failed"));
  }, intervalMinutes * 60 * 1000);

  logger.info({ intervalMinutes }, "Campaign sync job started");
}
