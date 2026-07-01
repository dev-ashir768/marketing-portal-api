import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import {
  uploadAndCreateCreative,
  listCreatives,
  getCreative,
  deleteCreative,
  attachCreativeToAd,
} from "../services/creative.service";

function requireUser(req: Request) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  return req.user;
}

function qs(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

// POST /creatives/upload
// multipart/form-data: file + metaAccountId or metaAdAccountId + optional ad copy fields
export const upload = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  if (!req.file) throw new AppError("No file uploaded — send file as multipart/form-data field 'file'", 400);

  const metaAccountId = req.body.metaAccountId as string | undefined;
  const metaAdAccountId = req.body.metaAdAccountId as string | undefined;

  if (!metaAccountId && !metaAdAccountId) {
    throw new AppError("Provide metaAccountId or metaAdAccountId in form data", 400);
  }

  const creative = await uploadAndCreateCreative(
    user.id,
    { metaAccountId, metaAdAccountId },
    req.file,
    {
      headline: req.body.headline,
      description: req.body.description,
      callToAction: req.body.callToAction,
      linkUrl: req.body.linkUrl,
      externalCustomerId: req.body.externalCustomerId,
    }
  );

  res.status(201).json({ success: true, data: creative });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await listCreatives(user.id, {
    metaAccountId: qs(req, "metaAccountId"),
    metaAdAccountId: qs(req, "metaAdAccountId"),
    externalCustomerId: qs(req, "externalCustomerId"),
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  });
  res.status(200).json({ success: true, ...result });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const creative = await getCreative(user.id, req.params.id, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: creative });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await deleteCreative(user.id, req.params.id, qs(req, "externalCustomerId"));
  res.status(204).send();
});

// POST /creatives/:id/attach — attach creative to an ad
export const attach = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { adId } = req.body;
  if (!adId) throw new AppError("adId is required in body", 400);
  const ad = await attachCreativeToAd(user.id, adId, req.params.id, qs(req, "externalCustomerId"));
  res.status(200).json({ success: true, data: ad });
});
