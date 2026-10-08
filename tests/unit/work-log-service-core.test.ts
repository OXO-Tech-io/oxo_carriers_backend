import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";

vi.mock("../../src/modules/work-logs/WorkLog", () => ({
  WorkLogModel: {
    createMany: vi.fn(),
    findByEmployeeId: vi.fn(),
    listAll: vi.fn(),
    summaryByUser: vi.fn(),
    sumMinutesForDate: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn() },
}));
// The deadline stamp hits tbl_work_log_settings + tbl_leave_calendar; it has its
// own coverage in work-log-deadline.test.ts, so it's stubbed here to keep these
// DB-free. "No deadline applied" is what an unconfigured install returns.
// getSettings().isEnabled drives whether read paths neutralize isLate/lateCount
// to zero (see OCD-469) - defaults to false (disabled), tests that need late
// data preserved flip deadlineSettingsState.isEnabled to true.
const { deadlineSettingsState } = vi.hoisted(() => ({ deadlineSettingsState: { isEnabled: false } }));
vi.mock("../../src/modules/work-logs/work-log-deadline.service", () => ({
  WorkLogDeadlineService: class {
    async evaluateMany(workDates: string[]) {
      return workDates.map(() => ({ deadlineAt: null, isLate: false, exemptReason: "disabled" as const }));
    }
    async getSettings() {
      return {
        isEnabled: deadlineSettingsState.isEnabled,
        deadlineTime: "18:00",
        timezone: "Asia/Colombo",
        updatedBy: null,
        updatedAt: null,
      };
    }
  },
}));
const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock("../../src/config/database", () => ({ default: { query: poolQuery } }));

import { WorkLogModel } from "../../src/modules/work-logs/WorkLog";
import { EmployeeModel } from "../../src/employees/Employee";
import { workLogService } from "../../src/modules/work-logs/workLog.service";

const wlm = WorkLogModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

const tempFiles: string[] = [];
async function writeWorkbook(rows: (string | number | Date)[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  rows.forEach((row) => sheet.addRow(row));
  const filePath = path.join(os.tmpdir(), `worklog-bulk-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  tempFiles.push(filePath);
  return filePath;
}

describe("workLogService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wlm.sumMinutesForDate.mockResolvedValue(0);
    deadlineSettingsState.isEnabled = false;
  });

  afterEach(() => {
    for (const file of tempFiles.splice(0)) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  describe("submitEntries", () => {
    it("maps entries into WorkLogModel rows", async () => {
      wlm.createMany.mockResolvedValue([{ id: 1 }]);
      await workLogService.submitEntries("EMP1", [
        { workDate: "2026-01-01", taskDescription: "Task", minutesSpent: 240 },
      ] as any);
      expect(wlm.createMany).toHaveBeenCalledWith([
        {
          employeeId: "EMP1",
          workDate: "2026-01-01",
          taskDescription: "Task",
          minutesSpent: 240,
          remarks: null,
          isLate: false,
          deadlineAt: null,
        },
      ]);
    });

    it("rejects a future-dated entry", async () => {
      await expect(
        workLogService.submitEntries("EMP1", [
          { workDate: "2999-01-01", taskDescription: "Task", minutesSpent: 60 },
        ] as any),
      ).rejects.toThrow(/future/i);
      expect(wlm.createMany).not.toHaveBeenCalled();
    });

    it("rejects when the day's total (including entries already stored) exceeds 1440 minutes", async () => {
      wlm.sumMinutesForDate.mockResolvedValue(1400);
      await expect(
        workLogService.submitEntries("EMP1", [
          { workDate: "2026-01-01", taskDescription: "Task", minutesSpent: 100 },
        ] as any),
      ).rejects.toThrow(/1440/);
      expect(wlm.createMany).not.toHaveBeenCalled();
    });

    it("sums multiple entries for the same date before checking the cap", async () => {
      wlm.createMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      await workLogService.submitEntries("EMP1", [
        { workDate: "2026-01-01", taskDescription: "A", minutesSpent: 700 },
        { workDate: "2026-01-01", taskDescription: "B", minutesSpent: 700 },
      ] as any);
      expect(wlm.createMany).toHaveBeenCalled();

      await expect(
        workLogService.submitEntries("EMP1", [
          { workDate: "2026-02-01", taskDescription: "A", minutesSpent: 800 },
          { workDate: "2026-02-01", taskDescription: "B", minutesSpent: 800 },
        ] as any),
      ).rejects.toThrow(/1440/);
    });
  });

  describe("updateEntry", () => {
    it("updates an entry the caller owns", async () => {
      wlm.findById.mockResolvedValue({ id: 1, employeeId: "EMP1" });
      wlm.update.mockResolvedValue({ id: 1 });
      await workLogService.updateEntry("EMP1", 1, {
        workDate: "2026-01-01",
        taskDescription: "Fixed",
        minutesSpent: 90,
      } as any);
      expect(wlm.update).toHaveBeenCalledWith(1, {
        workDate: "2026-01-01",
        taskDescription: "Fixed",
        minutesSpent: 90,
        remarks: null,
      });
    });

    it("rejects editing another employee's entry", async () => {
      wlm.findById.mockResolvedValue({ id: 1, employeeId: "EMP2" });
      await expect(
        workLogService.updateEntry("EMP1", 1, {
          workDate: "2026-01-01",
          taskDescription: "Fixed",
          minutesSpent: 90,
        } as any),
      ).rejects.toThrow(/own/i);
      expect(wlm.update).not.toHaveBeenCalled();
    });

    it("throws when the entry does not exist", async () => {
      wlm.findById.mockResolvedValue(null);
      await expect(
        workLogService.updateEntry("EMP1", 999, {
          workDate: "2026-01-01",
          taskDescription: "Fixed",
          minutesSpent: 90,
        } as any),
      ).rejects.toThrow(/not found/i);
    });
  });

  it("listAll resolves a numeric userId filter to an employeeId", async () => {
    em.findById.mockResolvedValue({ employeeId: "EMP9" });
    wlm.listAll.mockResolvedValue([]);
    await workLogService.listAll({ userId: 9 });
    expect(wlm.listAll).toHaveBeenCalledWith({ employeeId: "EMP9", from: undefined, to: undefined });
  });

  it("listAll passes employeeId as undefined when no userId filter is given", async () => {
    wlm.listAll.mockResolvedValue([]);
    await workLogService.listAll({});
    expect(wlm.listAll).toHaveBeenCalledWith({ employeeId: undefined, from: undefined, to: undefined });
    expect(em.findById).not.toHaveBeenCalled();
  });

  describe("getDailyStatus", () => {
    it("combines eligible-employee count with the range's summary rows", async () => {
      deadlineSettingsState.isEnabled = true; // preserve lateCount instead of neutralizing it
      wlm.summaryByUser.mockResolvedValue([
        { employeeId: "EMP1", firstName: "A", lastName: "B", totalMinutes: 240, entryCount: 1, lateCount: 0 },
        { employeeId: "EMP2", firstName: "C", lastName: "D", totalMinutes: 120, entryCount: 1, lateCount: 1 },
      ]);
      poolQuery.mockResolvedValue({ rows: [{ count: "5" }] });

      const status = await workLogService.getDailyStatus({ date: "2026-08-03" });

      expect(wlm.summaryByUser).toHaveBeenCalledWith({ from: "2026-08-03", to: "2026-08-03" });
      expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("tbl_employee"));
      expect(status).toEqual({
        from: "2026-08-03",
        to: "2026-08-03",
        totalEligible: 5,
        submittedCount: 2,
        onTimeCount: 1,
        lateCount: 1,
        pendingCount: 3,
      });
    });

    it("accepts an explicit from/to range spanning multiple days", async () => {
      wlm.summaryByUser.mockResolvedValue([]);
      poolQuery.mockResolvedValue({ rows: [{ count: "0" }] });

      const status = await workLogService.getDailyStatus({ from: "2026-08-01", to: "2026-08-07" });
      expect(wlm.summaryByUser).toHaveBeenCalledWith({ from: "2026-08-01", to: "2026-08-07" });
      expect(status.from).toBe("2026-08-01");
      expect(status.to).toBe("2026-08-07");
    });

    it("defaults to today when no date/range is given", async () => {
      wlm.summaryByUser.mockResolvedValue([]);
      poolQuery.mockResolvedValue({ rows: [{ count: "0" }] });

      const today = new Date().toISOString().slice(0, 10);
      const status = await workLogService.getDailyStatus();

      expect(status.from).toBe(today);
      expect(status.to).toBe(today);
      expect(wlm.summaryByUser).toHaveBeenCalledWith({ from: today, to: today });
    });

    it("clamps pendingCount at zero when more employees submitted than are recorded eligible", async () => {
      wlm.summaryByUser.mockResolvedValue([
        { employeeId: "EMP1", firstName: "A", lastName: "B", totalMinutes: 240, entryCount: 1, lateCount: 0 },
      ]);
      poolQuery.mockResolvedValue({ rows: [{ count: "0" }] });

      const status = await workLogService.getDailyStatus({ date: "2026-08-03" });
      expect(status.pendingCount).toBe(0);
    });
  });

  it("generateSummaryReport builds a workbook with one row per summary entry", async () => {
    wlm.summaryByUser.mockResolvedValue([
      { employeeId: "EMP1", firstName: "A", lastName: "B", totalMinutes: 2400, entryCount: 5, lateCount: 0 },
    ]);
    const buffer = await workLogService.generateSummaryReport({});
    expect(buffer).toBeInstanceOf(Buffer);
  });

  describe("bulkUpload", () => {
    it("throws when the workbook has no first sheet content matching headers", async () => {
      const filePath = await writeWorkbook([["Notes"]]);
      await expect(workLogService.bulkUpload("EMP1", filePath)).rejects.toThrow(/header row/i);
    });

    it("parses valid rows, converts Date cells, and skips blank rows", async () => {
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Minutes Spent", "Remarks"],
        [new Date("2026-01-15T00:00:00.000Z"), "Reviewed contracts", 180, "note"],
        ["", "", "", ""],
      ]);
      wlm.createMany.mockResolvedValue([{ id: 1 }]);

      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(wlm.createMany).toHaveBeenCalledWith([
        expect.objectContaining({
          employeeId: "EMP1",
          workDate: "2026-01-15",
          taskDescription: "Reviewed contracts",
          minutesSpent: 180,
          remarks: "note",
        }),
      ]);
    });

    it("flags a bad date with a message naming the expected format", async () => {
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Minutes Spent", "Remarks"],
        ["not-a-date", "Task", 60, ""],
      ]);
      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatch(/date/i);
      expect(wlm.createMany).not.toHaveBeenCalled();
    });

    it("flags an out-of-range minutes value with a message naming the 1440/24h limit", async () => {
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Minutes Spent", "Remarks"],
        ["2026-01-15", "Task", 1500, ""],
      ]);
      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("1440");
      expect(wlm.createMany).not.toHaveBeenCalled();
    });

    it("flags a negative minutes value the same way as any other out-of-range value", async () => {
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Minutes Spent", "Remarks"],
        ["2026-01-15", "Task", -5, ""],
      ]);
      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatch(/minutes/i);
      expect(wlm.createMany).not.toHaveBeenCalled();
    });

    it("flags a future-dated row separately from a data-validation failure", async () => {
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Minutes Spent", "Remarks"],
        ["2999-01-01", "Task", 60, ""],
      ]);
      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatch(/future/i);
    });

    it("flags a row that would push the day's total over 1440 minutes", async () => {
      wlm.sumMinutesForDate.mockResolvedValue(1400);
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Minutes Spent", "Remarks"],
        ["2026-01-15", "Task", 100, ""],
      ]);
      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("1440");
      expect(wlm.createMany).not.toHaveBeenCalled();
    });

    it("does not call createMany when every row is invalid or blank", async () => {
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Minutes Spent", "Remarks"],
        ["", "", "", ""],
      ]);
      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.success).toBe(0);
      expect(wlm.createMany).not.toHaveBeenCalled();
    });
  });
});
