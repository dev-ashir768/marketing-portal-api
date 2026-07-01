import { Request, Response } from "express";
import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { CampaignStatus, AdSetStatus, AdStatus } from "@prisma/client";

// Meta sends GET to verify the endpoint — respond with hub.challenge
// Security is handled on POST via X-Hub-Signature-256 (App Secret).
// Each customer sets their own verify_token in their Meta App — we accept any value here.
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && challenge) {
    logger.info("Meta webhook endpoint verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

// Verify the X-Hub-Signature-256 header using the Meta App secret
function verifySignature(rawBody: Buffer, signature: string, appSecret: string): boolean {
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// POST /webhooks/meta — Meta sends real-time events here
export const receiveWebhook = asyncHandler(async (req: Request, res: Response) => {
  // Acknowledge immediately — Meta expects 200 within 20 seconds
  res.sendStatus(200);

  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  const rawBody: Buffer = (req as any).rawBody;

  const payload = req.body;
  if (!payload || payload.object !== "ad_account") return;

  const entries: Array<{ id: string; changes: Array<{ field: string; value: unknown }> }> =
    payload.entry ?? [];

  for (const entry of entries) {
    const metaAdAccountId = `act_${entry.id}`;

    // Find the Meta account so we can verify the signature with that app's secret
    const metaAccount = await prisma.metaAccount.findFirst({
      where: { metaAdAccountId },
      include: { metaApp: true },
    });

    if (!metaAccount || !metaAccount.metaApp) {
      logger.warn({ metaAdAccountId }, "Webhook received for unknown ad account — skipping");
      continue;
    }

    // Verify signature if we have a raw body and app secret
    if (signature && rawBody && metaAccount.metaApp.appSecretEncrypted) {
      const { decryptToken } = await import("../utils/crypto");
      const appSecret = decryptToken({
        ciphertext: metaAccount.metaApp.appSecretEncrypted,
        iv: metaAccount.metaApp.appSecretIv!,
        authTag: metaAccount.metaApp.appSecretAuthTag!,
      });
      if (!verifySignature(rawBody, signature, appSecret)) {
        logger.warn({ metaAdAccountId }, "Webhook signature mismatch — ignoring");
        continue;
      }
    }

    for (const change of entry.changes) {
      await handleChange(metaAccount.id, change.field, change.value).catch((err) => {
        logger.error({ field: change.field, err }, "Error processing webhook change");
      });
    }
  }
});

const validCampaignStatuses = Object.values(CampaignStatus);
const validAdSetStatuses = Object.values(AdSetStatus);
const validAdStatuses = Object.values(AdStatus);

async function handleChange(metaAccountId: string, field: string, value: unknown) {
  const v = value as Record<string, string>;

  if (field === "campaigns") {
    const status = validCampaignStatuses.includes(v.status as CampaignStatus)
      ? (v.status as CampaignStatus)
      : undefined;

    await prisma.adCampaign.updateMany({
      where: { metaCampaignId: v.id, metaAccountId },
      data: {
        ...(v.name ? { name: v.name } : {}),
        ...(status ? { status } : {}),
      },
    });
    logger.info({ metaCampaignId: v.id, status }, "Webhook: campaign updated");
    return;
  }

  if (field === "adsets") {
    const status = validAdSetStatuses.includes(v.status as AdSetStatus)
      ? (v.status as AdSetStatus)
      : undefined;

    await prisma.adSet.updateMany({
      where: { metaAdSetId: v.id, metaAccountId },
      data: {
        ...(v.name ? { name: v.name } : {}),
        ...(status ? { status } : {}),
      },
    });
    logger.info({ metaAdSetId: v.id, status }, "Webhook: ad set updated");
    return;
  }

  if (field === "ads") {
    const status = validAdStatuses.includes(v.status as AdStatus)
      ? (v.status as AdStatus)
      : undefined;

    await prisma.ad.updateMany({
      where: { metaAdId: v.id, metaAccountId },
      data: {
        ...(v.name ? { name: v.name } : {}),
        ...(status ? { status } : {}),
      },
    });
    logger.info({ metaAdId: v.id, status }, "Webhook: ad updated");
    return;
  }

  logger.debug({ field }, "Webhook: unhandled field type");
}
