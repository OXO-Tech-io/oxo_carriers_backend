import { describe, it, expect } from "vitest";
import { userIdParamSchema } from "../../src/validators/employeePii.validator";

describe("employeePii.validator", () => {
  it("coerces a numeric string userId", () => {
    const result = userIdParamSchema.safeParse({ userId: "15" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.userId).toBe(15);
  });

  it("rejects a non-positive userId", () => {
    expect(userIdParamSchema.safeParse({ userId: "0" }).success).toBe(false);
    expect(userIdParamSchema.safeParse({ userId: "-5" }).success).toBe(false);
  });

  it("rejects a missing userId", () => {
    expect(userIdParamSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a non-numeric userId", () => {
    expect(userIdParamSchema.safeParse({ userId: "abc" }).success).toBe(false);
  });
});
