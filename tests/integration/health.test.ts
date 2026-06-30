import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: "ok" } });
  });
});

describe("404 handler", () => {
  it("returns a clean JSON 404 for unknown routes", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/this-route-does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
