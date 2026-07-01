import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { getInsights } from "../services/insights.service";

function requireUser(req: Request) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  return req.user;
}

function qs(req: Request, key: string): string | undefined {
  return typeof req.query[key] === "string" ? (req.query[key] as string) : undefined;
}

export const insights = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  const metaAdAccountId = qs(req, "metaAdAccountId");
  const metaAccountId = qs(req, "metaAccountId");
  const metaCampaignId = qs(req, "metaCampaignId");
  const metaAdSetId = qs(req, "metaAdSetId");
  const metaAdId = qs(req, "metaAdId");

  if (!metaAdAccountId && !metaAccountId && !metaCampaignId && !metaAdSetId && !metaAdId) {
    throw new AppError(
      "Provide at least one of: metaAdAccountId, metaAccountId, metaCampaignId, metaAdSetId, metaAdId",
      400
    );
  }

  const data = await getInsights(user.id, {
    metaAdAccountId,
    metaAccountId,
    metaCampaignId,
    metaAdSetId,
    metaAdId,
    externalCustomerId: qs(req, "externalCustomerId"),
    datePreset: qs(req, "datePreset"),
    since: qs(req, "since"),
    until: qs(req, "until"),
  });

  res.status(200).json({ success: true, data });
});
