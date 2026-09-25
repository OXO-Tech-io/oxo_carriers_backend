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
        minutesSpent: "480",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.minutesSpent).toBe(480);
    });

    it("rejects minutesSpent above 1440", () => {
      expect(
        workLogEntrySchema.safeParse({
          workDate: "2026-07-30",
          taskDescription: "Task",
          minutesSpent: 1441,
        }).success,
      ).toBe(false);
    });

    it("rejects minutesSpent of 0 or negative", () => {
      expect(
        workLogEntrySchema.safeParse({
          workDate: "2026-07-30",
          taskDescription: "Task",
          minutesSpent: 0,
        }).success,
      ).toBe(false);
    });

    it("rejects a non-integer minutesSpent", () => {
      expect(
        workLogEntrySchema.safeParse({
          workDate: "2026-07-30",
          taskDescription: "Task",
          minutesSpent: 90.5,
        }).success,
      ).toBe(false);
    });

    it("rejects an empty taskDescription", () => {
      expect(
        workLogEntrySchema.safeParse({
          workDate: "2026-07-30",
          taskDescription: "",
          minutesSpent: 240,
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
          { workDate: "2026-07-30", taskDescription: "A", minutesSpent: 240 },
          { workDate: "2026-07-31", taskDescription: "B", minutesSpent: 240 },
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
