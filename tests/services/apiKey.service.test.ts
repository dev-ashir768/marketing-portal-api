import { describe, it, expect, vi, beforeEach } from "vitest";

const userStore = new Map<string, any>();

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.apiKeyPrefix) return [...userStore.values()].find((u) => u.apiKeyPrefix === where.apiKeyPrefix) ?? null;
        return userStore.get(where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const user = { ...userStore.get(where.id), ...data };
        userStore.set(where.id, user);
        return user;
      }),
    },
  },
}));

import { generateApiKey, verifyApiKey, revokeApiKey } from "../../src/services/apiKey.service";
import { AppError } from "../../src/utils/AppError";

describe("apiKey.service", () => {
  beforeEach(() => {
    userStore.clear();
    userStore.set("user-1", { id: "user-1", email: "oms@example.com", role: "OWNER" });
  });

  it("generates a key that verifyApiKey resolves back to the owning user", async () => {
    const key = await generateApiKey("user-1");
    expect(key).toMatch(/^mp_[0-9a-f]{12}_[0-9a-f]{64}$/);

    const user = await verifyApiKey(key);
    expect(user.id).toBe("user-1");
  });

  it("rejects a key that was never issued", async () => {
    await expect(verifyApiKey("mp_deadbeefcafe_" + "0".repeat(64))).rejects.toThrow(AppError);
  });

  it("rejects the old key after a new one is generated (rotation)", async () => {
    const firstKey = await generateApiKey("user-1");
    await generateApiKey("user-1");

    await expect(verifyApiKey(firstKey)).rejects.toThrow(AppError);
  });

  it("rejects any key after revocation", async () => {
    const key = await generateApiKey("user-1");
    await revokeApiKey("user-1");

    await expect(verifyApiKey(key)).rejects.toThrow(AppError);
  });
});
