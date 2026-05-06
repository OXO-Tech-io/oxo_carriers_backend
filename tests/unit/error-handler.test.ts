import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { errorHandler } from "../../src/middleware/errorHandler";
import { AppError } from "../../src/utils/AppError";

const createRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe("errorHandler middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles ZodError with 400", () => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse({ email: "not-an-email" });
    if (parsed.success) {
      throw new Error("Expected validation error");
    }

    const res = createRes();
    errorHandler(parsed.error, {} as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Validation failed",
      }),
    );
  });

  it("handles AppError with its status code", () => {
    const res = createRes();
    errorHandler(
      new AppError("Not found", 404),
      {} as never,
      res as never,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Not found",
    });
  });

  it("handles unknown error as 500", () => {
    const res = createRes();
    errorHandler(new Error("Unexpected"), {} as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Internal server error",
      }),
    );
  });
});
