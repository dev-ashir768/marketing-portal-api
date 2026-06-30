import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const userStore = new Map<string, any>();

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.email) return [...userStore.values()].find((u) => u.email === where.email) ?? null;
        if (where.id) return userStore.get(where.id) ?? null;
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const user = { id: `user-${userStore.size + 1}`, role: "OWNER", ...data, portalUrl: data.portalUrl ?? null };
        userStore.set(user.id, user);
        return user;
      }),
    },
  },
}));

import { registerUser, loginUser } from "../../src/services/auth.service";
import { AppError } from "../../src/utils/AppError";

describe("auth.service", () => {
  beforeEach(() => {
    userStore.clear();
  });

  describe("registerUser", () => {
    it("creates a user with a hashed password and returns a token", async () => {
      const result = await registerUser({ email: "a@b.com", password: "SuperSecret123", name: "Jane" });

      expect(result.token).toBeTruthy();
      expect(result.user).toEqual({ id: expect.any(String), email: "a@b.com", name: "Jane", role: "OWNER", portalUrl: null });

      const stored = [...userStore.values()][0];
      expect(stored.passwordHash).not.toBe("SuperSecret123");
      expect(await bcrypt.compare("SuperSecret123", stored.passwordHash)).toBe(true);
    });

    it("rejects registering an email that already exists", async () => {
      await registerUser({ email: "dup@b.com", password: "SuperSecret123", name: "Jane" });

      await expect(registerUser({ email: "dup@b.com", password: "AnotherPass1", name: "Jane2" })).rejects.toThrow(
        AppError
      );
    });
  });

  describe("loginUser", () => {
    it("logs in with correct credentials", async () => {
      await registerUser({ email: "login@b.com", password: "SuperSecret123", name: "Jane" });

      const result = await loginUser({ email: "login@b.com", password: "SuperSecret123" });
      expect(result.token).toBeTruthy();
      expect(result.user.email).toBe("login@b.com");
    });

    it("rejects an unknown email", async () => {
      await expect(loginUser({ email: "nope@b.com", password: "whatever1" })).rejects.toThrow(AppError);
    });

    it("rejects an incorrect password", async () => {
      await registerUser({ email: "wrongpw@b.com", password: "SuperSecret123", name: "Jane" });

      await expect(loginUser({ email: "wrongpw@b.com", password: "WrongPassword" })).rejects.toThrow(AppError);
    });
  });
});
