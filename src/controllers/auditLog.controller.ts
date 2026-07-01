import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { listAuditLogs } from "../services/audit.service";
import { AuditAction, AuditResource } from "@prisma/client";

function requireUser(req: Request) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  return req.user;
}

function qs(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  const resource = qs(req, "resource") as AuditResource | undefined;
  const action = qs(req, "action") as AuditAction | undefined;

  const result = await listAuditLogs(user.id, {
    externalCustomerId: qs(req, "externalCustomerId"),
    resource,
    action,
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  });

  res.status(200).json({ success: true, ...result });
});
