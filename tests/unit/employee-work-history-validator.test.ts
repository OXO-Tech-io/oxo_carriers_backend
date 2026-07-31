import { describe, it, expect } from "vitest";
import {
  workHistoryAfterSchema,
  employeeIdParamSchema,
} from "../../src/validators/employeeWorkHistory.validator";

describe("employeeWorkHistory.validator", () => {
  it("accepts a valid work history record with default employmentType", () => {
    const result = workHistoryAfterSchema.safeParse({
      organization: "Acme Corp",
      positionHeld: "Engineer",
      startDate: "2018-01-01",
      endDate: "2020-01-01",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.employmentType).toBe("regular");
  });

  it("accepts a null endDate to represent 'Present'", () => {
    const result = workHistoryAfterSchema.safeParse({
      organization: "Acme Corp",
      positionHeld: "Engineer",
      startDate: "2018-01-01",
      endDate: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    const result = workHistoryAfterSchema.safeParse({
      organization: "Acme Corp",
      positionHeld: "Engineer",
      startDate: "2020-01-01",
      endDate: "2019-01-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["endDate"]);
  });

  it("rejects an invalid employmentType", () => {
    const result = workHistoryAfterSchema.safeParse({
      organization: "Acme Corp",
      positionHeld: "Engineer",
      employmentType: "contractor",
      startDate: "2018-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing organization", () => {
    const result = workHistoryAfterSchema.safeParse({
      positionHeld: "Engineer",
      startDate: "2018-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("validates employeeIdParamSchema", () => {
    expect(employeeIdParamSchema.safeParse({ employeeId: "EMP1" }).success).toBe(true);
    expect(employeeIdParamSchema.safeParse({ employeeId: "" }).success).toBe(false);
  });
});
