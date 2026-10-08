import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted, because vi.mock's factory is lifted above these declarations.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../src/config/database", () => ({ default: { query } }));

import { WorkLogDeadlineService, isValidDeadlineTime, isValidTimezone } from "../../src/modules/work-logs/work-log-deadline.service";

type Holiday = { date: string; is_recurring: boolean };

/**
 * The service issues two distinct reads - the settings singleton and the whole
 * leave calendar - so route each by the SQL it contains rather than by call
 * order, which varies between evaluate() and describe().
 */
function stubDb(
  settings: { is_enabled: boolean; deadline_time: string; timezone: string } | null,
  holidays: Holiday[] = [],
) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("tbl_work_log_settings")) {
      return { rows: settings ? [{ ...settings, updated_by: null, updated_at: null }] : [] };
    }
    if (sql.includes("tbl_leave_calendar")) {
      return { rows: holidays };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
}

// 2026-08-03 is a Monday; 08-08 Saturday, 08-09 Sunday.
const MONDAY = "2026-08-03";
const SATURDAY = "2026-08-08";
const SUNDAY = "2026-08-09";

// Asia/Colombo is UTC+5:30, so an 18:00 local deadline is 12:30Z the same day.
const enabled = { is_enabled: true, deadline_time: "18:00", timezone: "Asia/Colombo" };

describe("WorkLogDeadlineService", () => {
  let service: WorkLogDeadlineService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkLogDeadlineService();
  });

  describe("getSettings", () => {
    it("falls back to disabled defaults when the settings row is missing", async () => {
      stubDb(null);
      const settings = await service.getSettings();
      expect(settings).toMatchObject({ isEnabled: false, deadlineTime: "18:00", timezone: "Asia/Colombo" });
    });

    it("truncates an 'HH:MM:SS' stored value to 'HH:MM'", async () => {
      stubDb({ ...enabled, deadline_time: "17:30:00" });
      expect((await service.getSettings()).deadlineTime).toBe("17:30");
    });
  });

  describe("evaluate", () => {
    it("applies no deadline while the feature is disabled", async () => {
      stubDb({ ...enabled, is_enabled: false });
      const outcome = await service.evaluate(MONDAY, new Date("2026-08-03T23:00:00Z"));
      expect(outcome).toEqual({ deadlineAt: null, isLate: false, exemptReason: "disabled" });
    });

    it("resolves the deadline in the configured timezone, not UTC", async () => {
      stubDb(enabled);
      const outcome = await service.evaluate(MONDAY, new Date("2026-08-03T10:00:00Z"));
      // 18:00 Asia/Colombo === 12:30Z
      expect(outcome.deadlineAt?.toISOString()).toBe("2026-08-03T12:30:00.000Z");
      expect(outcome.isLate).toBe(false);
    });

    it("marks a submission after the cut-off as late", async () => {
      stubDb(enabled);
      const outcome = await service.evaluate(MONDAY, new Date("2026-08-03T13:00:00Z"));
      expect(outcome.isLate).toBe(true);
      expect(outcome.exemptReason).toBeNull();
    });

    it("treats a submission exactly at the cut-off as on time", async () => {
      stubDb(enabled);
      const outcome = await service.evaluate(MONDAY, new Date("2026-08-03T12:30:00Z"));
      expect(outcome.isLate).toBe(false);
    });

    it.each([
      ["Saturday", SATURDAY],
      ["Sunday", SUNDAY],
    ])("exempts %s regardless of submission time", async (_label, workDate) => {
      stubDb(enabled);
      const outcome = await service.evaluate(workDate, new Date("2026-08-31T23:00:00Z"));
      expect(outcome).toEqual({ deadlineAt: null, isLate: false, exemptReason: "weekend" });
    });

    it("exempts a work date that has a leave-calendar holiday", async () => {
      stubDb(enabled, [{ date: MONDAY, is_recurring: false }]);
      const outcome = await service.evaluate(MONDAY, new Date("2026-08-03T23:00:00Z"));
      expect(outcome).toEqual({ deadlineAt: null, isLate: false, exemptReason: "holiday" });
    });

    it("exempts a recurring holiday in a year other than the one it was stored under", async () => {
      // Stored against 2020 but flagged recurring - it should still exempt 2026.
      stubDb(enabled, [{ date: "2020-08-03", is_recurring: true }]);
      const outcome = await service.evaluate(MONDAY, new Date("2026-08-03T23:00:00Z"));
      expect(outcome.exemptReason).toBe("holiday");
    });

    it("does not exempt a non-recurring holiday from a different year", async () => {
      stubDb(enabled, [{ date: "2020-08-03", is_recurring: false }]);
      const outcome = await service.evaluate(MONDAY, new Date("2026-08-03T23:00:00Z"));
      expect(outcome.exemptReason).toBeNull();
      expect(outcome.isLate).toBe(true);
    });
  });

  describe("evaluateMany", () => {
    it("reads settings and the calendar once for the whole batch", async () => {
      stubDb(enabled, [{ date: "2026-08-04", is_recurring: false }]);
      const outcomes = await service.evaluateMany(
        [MONDAY, "2026-08-04", SATURDAY],
        new Date("2026-08-10T23:00:00Z"),
      );

      expect(outcomes.map((o) => o.exemptReason)).toEqual([null, "holiday", "weekend"]);
      expect(outcomes[0].isLate).toBe(true);
      expect(query).toHaveBeenCalledTimes(2);
    });

    it("short-circuits to disabled outcomes without reading the calendar", async () => {
      stubDb({ ...enabled, is_enabled: false });
      const outcomes = await service.evaluateMany([MONDAY, SATURDAY]);
      expect(outcomes.every((o) => o.exemptReason === "disabled")).toBe(true);
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateSettings", () => {
    it("merges partial updates over the current values", async () => {
      stubDb(enabled);
      await service.updateSettings(7, { deadlineTime: "16:45" });

      const upsert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO tbl_work_log_settings"));
      expect(upsert?.[1]).toEqual([true, "16:45", "Asia/Colombo", 7]);
    });
  });

  describe("validators", () => {
    it.each(["00:00", "09:30", "23:59"])("accepts %s", (value) => {
      expect(isValidDeadlineTime(value)).toBe(true);
    });

    it.each(["24:00", "9:30", "18:60", "", "18:00:00"])("rejects %s", (value) => {
      expect(isValidDeadlineTime(value)).toBe(false);
    });

    it("accepts a known IANA zone and rejects nonsense", () => {
      expect(isValidTimezone("Asia/Colombo")).toBe(true);
      expect(isValidTimezone("Mars/Olympus_Mons")).toBe(false);
    });
  });
});
