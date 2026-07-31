import { describe, it, expect } from "vitest";
import {
  createEmployeeNoteSchema,
  updateEmployeeNoteSchema,
  employeeNoteIdParamSchema,
  employeeUserIdParamSchema,
} from "../../src/validators/employeeNote.validator";

describe("employeeNote.validator", () => {
  it("accepts a valid create payload and coerces employeeUserId", () => {
    const result = createEmployeeNoteSchema.safeParse({
      employeeUserId: "7",
      content: "Great performance this quarter.",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.employeeUserId).toBe(7);
  });

  it("rejects create payload with empty content", () => {
    expect(
      createEmployeeNoteSchema.safeParse({ employeeUserId: 1, content: "" }).success,
    ).toBe(false);
  });

  it("rejects create payload with content over 5000 chars", () => {
    expect(
      createEmployeeNoteSchema.safeParse({
        employeeUserId: 1,
        content: "a".repeat(5001),
      }).success,
    ).toBe(false);
  });

  it("rejects a non-positive employeeUserId", () => {
    expect(
      createEmployeeNoteSchema.safeParse({ employeeUserId: -1, content: "note" }).success,
    ).toBe(false);
  });

  it("validates updateEmployeeNoteSchema requires content", () => {
    expect(updateEmployeeNoteSchema.safeParse({}).success).toBe(false);
    expect(updateEmployeeNoteSchema.safeParse({ content: "updated" }).success).toBe(true);
  });

  it("coerces id params", () => {
    expect(employeeNoteIdParamSchema.safeParse({ id: "3" }).success).toBe(true);
    expect(employeeUserIdParamSchema.safeParse({ employeeUserId: "9" }).success).toBe(true);
  });

  it("rejects non-numeric id params", () => {
    expect(employeeNoteIdParamSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});
