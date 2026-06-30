import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { registerUser, loginUser, updateProfile } from "../services/auth.service";
import { AppError } from "../utils/AppError";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body);
  res.status(200).json({ success: true, data: result });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const user = await updateProfile(req.user.id, req.body);
  res.status(200).json({ success: true, data: user });
});
