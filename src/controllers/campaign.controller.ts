import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  syncCampaignsFromMeta,
} from "../services/campaign.service";

function requireUser(req: Request) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  return req.user;
}

function qs(req: Request, key: string): string | undefined {
  return typeof req.query[key] === "string" ? (req.query[key] as string) : undefined;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const campaign = await createCampaign(user.id, req.body);
  res.status(201).json({ success: true, data: campaign });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const campaigns = await listCampaigns(user.id, {
    metaAccountId: qs(req, "metaAccountId"),
    metaAdAccountId: qs(req, "metaAdAccountId"),
    externalCustomerId: qs(req, "externalCustomerId"),
  });
  res.status(200).json({ success: true, data: campaigns });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const campaign = await getCampaign(user.id, req.params.id, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: campaign });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const campaign = await updateCampaign(user.id, req.params.id, req.body, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: campaign });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await deleteCampaign(user.id, req.params.id, qs(req, "externalCustomerId"));
  res.status(204).send();
});

export const sync = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const metaAccountId = qs(req, "metaAccountId");
  const metaAdAccountId = qs(req, "metaAdAccountId");
  const externalCustomerId = qs(req, "externalCustomerId");

  if (!metaAccountId && !metaAdAccountId) {
    throw new AppError("Pass either metaAccountId (internal UUID) or metaAdAccountId (act_xxx)", 400);
  }

  const result = await syncCampaignsFromMeta(
    user.id,
    { metaAccountId, metaAdAccountId },
    externalCustomerId
  );
  res.status(200).json({ success: true, data: result });
});
