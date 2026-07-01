import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { createAd, syncAds, listAds, getAd, updateAd, deleteAd } from "../services/ad.service";

function requireUser(req: Request) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  return req.user;
}

function qs(req: Request, key: string): string | undefined {
  return typeof req.query[key] === "string" ? (req.query[key] as string) : undefined;
}


export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const ad = await createAd(user.id, req.params.adSetId, {
    ...req.body,
    externalCustomerId: qs(req, "externalCustomerId") ?? req.body.externalCustomerId,
  });
  res.status(201).json({ success: true, data: ad });
});

export const sync = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await syncAds(user.id, req.params.adSetId, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: result });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await listAds(user.id, req.params.adSetId, {
    externalCustomerId: qs(req, "externalCustomerId"),
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  });
  res.status(200).json({ success: true, ...result });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const ad = await getAd(user.id, req.params.id, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: ad });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const ad = await updateAd(user.id, req.params.id, req.body, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: ad });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await deleteAd(user.id, req.params.id, qs(req, "externalCustomerId"));
  res.status(204).send();
});
