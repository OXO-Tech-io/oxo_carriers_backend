import { describe, it, expect } from "vitest";
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "../../src/utils/AppError";

describe("AppError classes", () => {
  it("creates base AppError with defaults", () => {
    const err = new AppError("Boom");
    expect(err.message).toBe("Boom");
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
  });

  it("creates derived errors with expected status codes", () => {
    expect(new BadRequestError().statusCode).toBe(400);
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
  });
});
