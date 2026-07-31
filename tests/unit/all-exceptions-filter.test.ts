import { describe, it, expect, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { ZodError, z } from "zod";
import { AllExceptionsFilter } from "../../src/common/filters/all-exceptions.filter";
import { AppError } from "../../src/utils/AppError";

const createHost = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  const request = { log: undefined };
  const host: any = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };
  return { response, host };
};

describe("AllExceptionsFilter", () => {
  it("returns 400 with formatted issues for a ZodError", () => {
    const filter = new AllExceptionsFilter();
    const { response, host } = createHost();

    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    const zodError = (result as { success: false; error: ZodError }).error;

    filter.catch(zodError, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Validation failed",
        errors: expect.arrayContaining([expect.objectContaining({ path: "name" })]),
      }),
    );
  });

  it("returns the AppError's own status code and message", () => {
    const filter = new AllExceptionsFilter();
    const { response, host } = createHost();

    filter.catch(new AppError("Not allowed", 403), host);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ success: false, message: "Not allowed" });
  });

  it("returns the HttpException's status and message", () => {
    const filter = new AllExceptionsFilter();
    const { response, host } = createHost();

    filter.catch(new BadRequestException("Bad input"), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Bad input" }),
    );
  });

  it("joins array messages from an HttpException response body", () => {
    const filter = new AllExceptionsFilter();
    const { response, host } = createHost();

    filter.catch(new BadRequestException({ message: ["field a required", "field b required"] }), host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "field a required, field b required" }),
    );
  });

  it("returns 500 for an unrecognized error", () => {
    const filter = new AllExceptionsFilter();
    const { response, host } = createHost();

    filter.catch(new Error("boom"), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Internal server error" }),
    );
  });
});
