import { describe, it, expect, vi, beforeEach } from "vitest";

const appStore = new Map<string, any>();

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    metaApp: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.appId) return [...appStore.values()].find((a) => a.appId === where.appId) ?? null;
        if (where.id) return appStore.get(where.id) ?? null;
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const app = { id: `app-${appStore.size + 1}`, isActive: true, ...data };
        appStore.set(app.id, app);
        return app;
      }),
    },
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { createMetaApp } from "../../src/services/metaApp.service";
import { AppError } from "../../src/utils/AppError";

describe("metaApp.service.createMetaApp", () => {
  beforeEach(() => {
    appStore.clear();
    fetchMock.mockReset();
  });

  it("rejects credentials Meta says are invalid, without ever storing them", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: { message: "bad creds" } }) });

    await expect(createMetaApp("user-1", { appId: "999", appSecret: "fake-secret" })).rejects.toThrow(AppError);
    expect(appStore.size).toBe(0);
  });

  it("stores the app once Meta confirms the credentials are real", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access_token: "999|abc" }) });

    const result = await createMetaApp("user-1", { appId: "999", appSecret: "real-secret", label: "Acme" });

    expect(result.appId).toBe("999");
    expect(appStore.size).toBe(1);
    expect((result as any).appSecretEncrypted).toBeUndefined();
  });

  it("rejects a duplicate appId without calling Meta at all", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access_token: "999|abc" }) });
    await createMetaApp("user-1", { appId: "999", appSecret: "real-secret" });

    fetchMock.mockClear();
    await expect(createMetaApp("user-2", { appId: "999", appSecret: "real-secret" })).rejects.toThrow(AppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
