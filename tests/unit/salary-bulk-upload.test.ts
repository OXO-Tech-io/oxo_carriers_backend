import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/modules/salary/Salary", () => ({
  SalaryModel: { createSalaryFromExcel: vi.fn() },
}));
vi.mock("../../src/config/database", () => ({
  default: { query: vi.fn() },
}));
vi.mock("../../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnValue({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  },
}));

import { SalaryModel } from "../../src/modules/salary/Salary";
import pool from "../../src/config/database";
import { SalaryService } from "../../src/modules/salary/salary.service";

const sm = SalaryModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const poolQueryMock = (pool as any).query as ReturnType<typeof vi.fn>;

const hr = { userId: 2, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;
const employeeUser = { userId: 5, employeeId: "EMP5", role: UserRole.EMPLOYEE } as any;

const tempFiles: string[] = [];

async function writeWorkbook(rows: (string | number)[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  rows.forEach((row) => sheet.addRow(row));
  const filePath = path.join(os.tmpdir(), `salary-bulk-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  tempFiles.push(filePath);
  return filePath;
}

describe("SalaryService.uploadBulkSalaries", () => {
  const service = new SalaryService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const file of tempFiles.splice(0)) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it("forbids non-HR roles", async () => {
    const filePath = await writeWorkbook([["id", "name", "Local Salary", "OXO International Salary"]]);
    await expect(
      service.uploadBulkSalaries(filePath, { month: "8", year: "2026" }, employeeUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it("requires month and year", async () => {
    const filePath = await writeWorkbook([["id", "name", "Local Salary", "OXO International Salary"]]);
    await expect(service.uploadBulkSalaries(filePath, { month: "", year: "" } as any, hr)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects a sheet missing required columns", async () => {
    const filePath = await writeWorkbook([["name", "notes"]]);
    await expect(
      service.uploadBulkSalaries(filePath, { month: "8", year: "2026" }, hr),
    ).rejects.toThrow(BadRequestException);
  });

  it("parses rows by numeric id, cleans currency-formatted numbers, and reports success", async () => {
    const filePath = await writeWorkbook([
      ["id", "Name", "Local Salary", "OXO International Salary", "Working Days"],
      [1, "Jane Doe", "1,500.50", "$2,000", "20"],
    ]);
    poolQueryMock.mockResolvedValue({ rows: [{ id: 1, employee_id: "EMP1" }] });
    sm.createSalaryFromExcel.mockResolvedValue({ id: 1 });

    const result = await service.uploadBulkSalaries(filePath, { month: "8", year: "2026" }, hr);

    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(sm.createSalaryFromExcel).toHaveBeenCalledWith(
      "EMP1",
      new Date(2026, 7, 1),
      expect.objectContaining({
        localSalary: 1500.5,
        oxoInternationalSalary: 2000,
        fullSalary: 3500.5,
        workedDays: 20,
      }),
      hr.userId,
    );
    // The service deletes the uploaded file once processing finishes.
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("resolves a non-numeric id via the employee_id column", async () => {
    const filePath = await writeWorkbook([
      ["id", "Name", "Local Salary", "OXO International Salary"],
      ["EMP7", "John Roe", "1000", "500"],
    ]);
    poolQueryMock.mockResolvedValue({ rows: [{ id: 7, employee_id: "EMP7" }] });
    sm.createSalaryFromExcel.mockResolvedValue({ id: 2 });

    const result = await service.uploadBulkSalaries(filePath, { month: "8", year: "2026" }, hr);
    expect(result.success).toBe(1);
    expect(poolQueryMock).toHaveBeenCalledWith(expect.stringContaining("WHERE employee_id = $1"), ["EMP7"]);
  });

  it("counts a row with an unresolvable id as failed", async () => {
    const filePath = await writeWorkbook([
      ["id", "Name", "Local Salary", "OXO International Salary"],
      ["UNKNOWN", "Nobody", "1000", "500"],
    ]);
    poolQueryMock.mockResolvedValue({ rows: [] });

    const result = await service.uploadBulkSalaries(filePath, { month: "8", year: "2026" }, hr);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("not found in system");
    expect(sm.createSalaryFromExcel).not.toHaveBeenCalled();
  });

  it("skips blank id rows without counting them as failures", async () => {
    const filePath = await writeWorkbook([
      ["id", "Name", "Local Salary", "OXO International Salary"],
      ["", "", "", ""],
      [1, "Jane", "1000", "500"],
    ]);
    poolQueryMock.mockResolvedValue({ rows: [{ id: 1, employee_id: "EMP1" }] });
    sm.createSalaryFromExcel.mockResolvedValue({ id: 1 });

    const result = await service.uploadBulkSalaries(filePath, { month: "8", year: "2026" }, hr);
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("records a per-row failure without aborting the rest of the batch", async () => {
    const filePath = await writeWorkbook([
      ["id", "Name", "Local Salary", "OXO International Salary"],
      [1, "Jane", "1000", "500"],
      [2, "John", "2000", "600"],
    ]);
    sm.createSalaryFromExcel.mockRejectedValueOnce(new Error("duplicate")).mockResolvedValueOnce({ id: 2 });

    const result = await service.uploadBulkSalaries(filePath, { month: "8", year: "2026" }, hr);
    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("duplicate");
  });
});
