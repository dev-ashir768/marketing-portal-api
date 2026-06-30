import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { registerUser, loginUser, updateProfile } from "../services/auth.service";
import { generateApiKey, revokeApiKey } from "../services/apiKey.service";
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

// Generates (or rotates) this user's server-to-server API key. The plaintext
// key is returned exactly once here — only its hash is stored, so if it's
// lost the only recovery is calling this again to issue a new one.
export const createApiKey = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const apiKey = await generateApiKey(req.user.id);
  res.status(201).json({ success: true, data: { apiKey } });
});

export const deleteApiKey = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  await revokeApiKey(req.user.id);
  res.status(204).send();
});
