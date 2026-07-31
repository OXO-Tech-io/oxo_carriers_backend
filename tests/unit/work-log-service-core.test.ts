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
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn() },
}));

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
  });

  afterEach(() => {
    for (const file of tempFiles.splice(0)) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it("submitEntries maps entries into WorkLogModel rows", async () => {
    wlm.createMany.mockResolvedValue([{ id: 1 }]);
    await workLogService.submitEntries("EMP1", [
      { workDate: "2026-01-01", taskDescription: "Task", hoursSpent: 4 },
    ] as any);
    expect(wlm.createMany).toHaveBeenCalledWith([
      { employeeId: "EMP1", workDate: "2026-01-01", taskDescription: "Task", hoursSpent: 4, remarks: null },
    ]);
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

  it("generateSummaryReport builds a workbook with one row per summary entry", async () => {
    wlm.summaryByUser.mockResolvedValue([
      { employeeId: "EMP1", firstName: "A", lastName: "B", totalHours: 40, entryCount: 5 },
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
        ["Date", "Task Description", "Hours Spent", "Remarks"],
        [new Date("2026-01-15T00:00:00.000Z"), "Reviewed contracts", 3, "note"],
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
          hoursSpent: 3,
          remarks: "note",
        }),
      ]);
    });

    it("counts invalid rows (bad date/negative hours) as failures with a message", async () => {
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Hours Spent", "Remarks"],
        ["not-a-date", "Task", -5, ""],
      ]);
      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("invalid or incomplete data");
      expect(wlm.createMany).not.toHaveBeenCalled();
    });

    it("does not call createMany when every row is invalid or blank", async () => {
      const filePath = await writeWorkbook([
        ["Date", "Task Description", "Hours Spent", "Remarks"],
        ["", "", "", ""],
      ]);
      const result = await workLogService.bulkUpload("EMP1", filePath);
      expect(result.success).toBe(0);
      expect(wlm.createMany).not.toHaveBeenCalled();
    });
  });
});
