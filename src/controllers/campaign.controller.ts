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

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const campaign = await createCampaign(user.id, req.body);
  res.status(201).json({ success: true, data: campaign });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const metaAccountId = typeof req.query.metaAccountId === "string" ? req.query.metaAccountId : undefined;
  const campaigns = await listCampaigns(user.id, metaAccountId);
  res.status(200).json({ success: true, data: campaigns });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const campaign = await getCampaign(user.id, req.params.id);
  res.status(200).json({ success: true, data: campaign });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const campaign = await updateCampaign(user.id, req.params.id, req.body);
  res.status(200).json({ success: true, data: campaign });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await deleteCampaign(user.id, req.params.id);
  res.status(204).send();
});

export const sync = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const metaAccountId = typeof req.query.metaAccountId === "string" ? req.query.metaAccountId : undefined;
  if (!metaAccountId) throw new AppError("metaAccountId query param is required", 400);
  const result = await syncCampaignsFromMeta(user.id, metaAccountId);
  res.status(200).json({ success: true, data: result });
});
