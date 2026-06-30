import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { AuthenticatedUser } from "../types/express";

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Missing or malformed Authorization header", 401);
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const user: AuthenticatedUser = { id: payload.sub, email: payload.email, role: payload.role };
    req.user = user;
    next();
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError("Insufficient permissions", 403);
    }
    next();
  };
}
