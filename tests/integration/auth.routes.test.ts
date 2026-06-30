import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const userStore = new Map<string, any>();

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.email) return [...userStore.values()].find((u) => u.email === where.email) ?? null;
        if (where.id) return userStore.get(where.id) ?? null;
        return null;
      }),
      findMany: vi.fn(async () => []), // used by CORS's dynamic portalUrl allowlist
      create: vi.fn(async ({ data }: any) => {
        const user = { id: `user-${userStore.size + 1}`, portalUrl: null, role: "OWNER", ...data };
        userStore.set(user.id, user);
        return user;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const user = { ...userStore.get(where.id), ...data };
        userStore.set(where.id, user);
        return user;
      }),
    },
  },
}));

import { createApp } from "../../src/app";

describe("Auth routes", () => {
  beforeEach(() => {
    userStore.clear();
  });

  it("POST /api/v1/auth/register creates a user and returns a token", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "new@example.com", password: "SuperSecret123", name: "New User" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe("new@example.com");
  });

  it("rejects registration with an invalid email (Zod validation)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "SuperSecret123", name: "New User" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/v1/auth/login succeeds with correct credentials after registering", async () => {
    const app = createApp();
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "login@example.com", password: "SuperSecret123", name: "Login User" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@example.com", password: "SuperSecret123" });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it("POST /api/v1/auth/login returns 401 for wrong password", async () => {
    const app = createApp();
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "wrongpw@example.com", password: "SuperSecret123", name: "User" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "wrongpw@example.com", password: "WrongPassword1" });

    expect(res.status).toBe(401);
  });

  it("PATCH /api/v1/auth/me requires authentication", async () => {
    const app = createApp();
    const res = await request(app).patch("/api/v1/auth/me").send({ name: "New Name" });

    expect(res.status).toBe(401);
  });
});
