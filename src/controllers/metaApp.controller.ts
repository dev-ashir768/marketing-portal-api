import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { createMetaApp, listMetaApps } from "../services/metaApp.service";
import { AppError } from "../utils/AppError";

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const app = await createMetaApp(req.user.id, req.body);
  res.status(201).json({ success: true, data: app });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const apps = await listMetaApps(req.user.id);
  res.status(200).json({ success: true, data: apps });
});
