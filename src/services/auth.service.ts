import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { RegisterInput, LoginInput, UpdateProfileInput } from "../utils/schemas/auth.schema";

const SALT_ROUNDS = 12;

function signToken(user: { id: string; email: string; role: string }): string {
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.JWT_SECRET, options);
}

function toPublicUser(user: { id: string; email: string; name: string; role: string; portalUrl: string | null }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, portalUrl: user.portalUrl };
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError("An account with this email already exists", 409);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash, name: input.name, portalUrl: input.portalUrl },
  });

  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: input,
  });
  return toPublicUser(user);
}
