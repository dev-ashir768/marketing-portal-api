import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { AuthenticatedUser } from "../types/express";
import { verifyApiKey } from "../services/apiKey.service";

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

// Accepts either:
//   Authorization: Bearer <JWT>   — interactive logins (a human in a browser)
//   X-API-Key: <key>              — server-to-server integrations (e.g. an
//                                    external OMS calling on behalf of its own
//                                    customers, which never log into this API directly)
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const apiKey = req.headers["x-api-key"];
    if (typeof apiKey === "string") {
      const user = await verifyApiKey(apiKey);
      req.user = { id: user.id, email: user.email, role: user.role };
      return next();
    }

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError("Missing Authorization header or X-API-Key", 401);
    }

    const token = header.slice("Bearer ".length);
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const user: AuthenticatedUser = { id: payload.sub, email: payload.email, role: payload.role };
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError("Invalid or expired token", 401));
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
