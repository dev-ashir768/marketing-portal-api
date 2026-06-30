import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Response } from "express";
import { errorHandler, notFoundHandler } from "../../src/middlewares/error.middleware";
import { AppError } from "../../src/utils/AppError";

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("error middleware", () => {
  it("notFoundHandler returns a 404 with the requested route in the message", () => {
    const req = { method: "GET", originalUrl: "/api/v1/nope" } as any;
    const res = mockRes();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ message: expect.stringContaining("/api/v1/nope") }) })
    );
  });

  it("maps a ZodError to a 400 with validation details", () => {
    const res = mockRes();
    const zodError = z.object({ name: z.string() }).safeParse({}).error as z.ZodError;

    errorHandler(zodError, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ message: "Validation failed" }) })
    );
  });

  it("maps an AppError to its declared statusCode", () => {
    const res = mockRes();
    const err = new AppError("Meta account not found", 404);

    errorHandler(err, {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ message: "Meta account not found" }) })
    );
  });

  it("falls back to 500 for an unrecognized error", () => {
    const res = mockRes();

    errorHandler(new Error("boom"), {} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
