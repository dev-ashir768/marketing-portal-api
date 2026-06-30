import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Request, Response } from "express";
import { validate } from "../../src/middlewares/validate.middleware";

function mockReq(body: unknown): Request {
  return { body, query: {}, params: {} } as unknown as Request;
}

describe("validate middleware", () => {
  const schema = z.object({ email: z.string().email(), age: z.coerce.number().int().positive() });

  it("calls next() and overwrites req.body with the parsed result on valid input", () => {
    const req = mockReq({ email: "a@b.com", age: "25" });
    const next = vi.fn();

    validate({ body: schema })(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ email: "a@b.com", age: 25 });
  });

  it("throws a ZodError (caught upstream by asyncHandler/errorHandler) on invalid input", () => {
    const req = mockReq({ email: "not-an-email", age: -1 });
    const next = vi.fn();

    expect(() => validate({ body: schema })(req, {} as Response, next)).toThrow();
    expect(next).not.toHaveBeenCalled();
  });
});
