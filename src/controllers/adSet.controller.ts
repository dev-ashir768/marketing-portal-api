import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { syncAdSets, listAdSets, getAdSet, updateAdSet, deleteAdSet } from "../services/adSet.service";

function requireUser(req: Request) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  return req.user;
}

function qs(req: Request, key: string): string | undefined {
  return typeof req.query[key] === "string" ? (req.query[key] as string) : undefined;
}

export const sync = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { campaignId } = req.params;
  const result = await syncAdSets(user.id, campaignId, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: result });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await listAdSets(user.id, req.params.campaignId, {
    externalCustomerId: qs(req, "externalCustomerId"),
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  });
  res.status(200).json({ success: true, ...result });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const adSet = await getAdSet(user.id, req.params.id, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: adSet });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const adSet = await updateAdSet(user.id, req.params.id, req.body, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: adSet });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await deleteAdSet(user.id, req.params.id, qs(req, "externalCustomerId"));
  res.status(204).send();
});
