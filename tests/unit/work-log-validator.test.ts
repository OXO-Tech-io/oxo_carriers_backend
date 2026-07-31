import { describe, it, expect } from "vitest";
import {
  workLogEntrySchema,
  submitWorkLogsSchema,
  listWorkLogsQuerySchema,
} from "../../src/validators/workLog.validator";

describe("workLog.validator", () => {
  describe("workLogEntrySchema", () => {
    it("accepts a valid entry", () => {
      const result = workLogEntrySchema.safeParse({
        workDate: "2026-07-30",
        taskDescription: "Wrote unit tests",
        hoursSpent: "8",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.hoursSpent).toBe(8);
    });

    it("rejects hoursSpent above 24", () => {
      expect(
        workLogEntrySchema.safeParse({
          workDate: "2026-07-30",
          taskDescription: "Task",
          hoursSpent: 25,
        }).success,
      ).toBe(false);
    });

    it("rejects hoursSpent of 0 or negative", () => {
      expect(
        workLogEntrySchema.safeParse({
          workDate: "2026-07-30",
          taskDescription: "Task",
          hoursSpent: 0,
        }).success,
      ).toBe(false);
    });

    it("rejects an empty taskDescription", () => {
      expect(
        workLogEntrySchema.safeParse({
          workDate: "2026-07-30",
          taskDescription: "",
          hoursSpent: 4,
        }).success,
      ).toBe(false);
    });
  });

  describe("submitWorkLogsSchema", () => {
    it("requires at least one entry", () => {
      expect(submitWorkLogsSchema.safeParse({ entries: [] }).success).toBe(false);
    });

    it("accepts multiple valid entries", () => {
      const result = submitWorkLogsSchema.safeParse({
        entries: [
          { workDate: "2026-07-30", taskDescription: "A", hoursSpent: 4 },
          { workDate: "2026-07-31", taskDescription: "B", hoursSpent: 4 },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("listWorkLogsQuerySchema", () => {
    it("accepts an empty query", () => {
      expect(listWorkLogsQuerySchema.safeParse({}).success).toBe(true);
    });

    it("coerces userId and validates date range fields", () => {
      const result = listWorkLogsQuerySchema.safeParse({
        from: "2026-07-01",
        to: "2026-07-31",
        userId: "5",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.userId).toBe(5);
    });

    it("rejects a malformed from date", () => {
      expect(listWorkLogsQuerySchema.safeParse({ from: "07-01-2026" }).success).toBe(false);
    });
  });
});
