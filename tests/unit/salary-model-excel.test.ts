import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("../../src/utils/encryption", () => ({
  encryptSalary: (v: number) => `enc:${v}`,
  decryptSalary: (v: string) => (typeof v === "string" && v.startsWith("enc:") ? v.slice(4) : v),
  hashIdentifier: (v: string) => v,
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByEmployeeIds: vi.fn() },
}));

import pool from "../../src/config/database";
import { SalaryModel } from "../../src/modules/salary/Salary";

const query = (pool as any).query as ReturnType<typeof vi.fn>;

// Minimal in-memory stand-in for the tables createSalaryFromExcel touches.
function installFakeDb(existingComponents: string[]) {
  const components = new Map<string, number>(existingComponents.map((name, i) => [name, i + 1]));
  let nextId = existingComponents.length + 1;
  const slipDetails: Array<{ component: string; amount: string; type: string }> = [];
  let salaryRow: any = null;

  query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("information_schema.columns")) {
      return { rows: [{ column_name: "local_salary" }, { column_name: "oxo_international_salary" }] };
    }
    if (sql.includes("CREATE UNIQUE INDEX")) return { rows: [] };
    if (sql.includes("INSERT INTO tbl_monthly_salaries")) {
      salaryRow = {
        id: 77,
        employee_id: params[0],
        basic_salary: params[2],
        local_salary: params[3],
        oxo_international_salary: params[4],
        total_earnings: params[5],
        total_deductions: params[6],
        net_salary: params[7],
      };
      return { rows: [{ id: 77 }] };
    }
    if (sql.includes("SELECT id, oxo_international_salary FROM tbl_monthly_salaries")) {
      return { rows: [{ id: 77, oxo_international_salary: salaryRow.oxo_international_salary }] };
    }
    if (sql.includes("SELECT * FROM tbl_monthly_salaries WHERE id")) return { rows: [salaryRow] };
    if (sql.includes("DELETE FROM tbl_salary_slip_details")) return { rows: [] };
    if (sql.includes("SELECT id FROM tbl_salary_components WHERE name = $1")) {
      const id = components.get(params[0]);
      return { rows: id ? [{ id }] : [] };
    }
    if (sql.includes("INSERT INTO tbl_salary_components")) {
      const id = nextId++;
      components.set(params[0], id);
      return { rows: [{ id }] };
    }
    if (sql.includes("INSERT INTO tbl_salary_slip_details")) {
      const name = [...components.entries()].find(([, id]) => id === params[1])![0];
      slipDetails.push({ component: name, amount: params[2], type: params[3] });
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  return { slipDetails, components };
}

describe("SalaryModel.createSalaryFromExcel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const excelData = {
    fullSalary: 0,
    localSalary: 30000,
    oxoInternationalSalary: 30000,
    workedDays: 0,
    availableDates: 0,
    leaves: 0,
    epfDeduction: 2400,
    allowances: 50000,
    salaryAdvanceDeductions: 3000,
  };

  it("creates missing Full Salary / Local Salary / Provident Fund components so every slip detail is stored (OCD-577/578)", async () => {
    // Database where none of the payroll components were ever seeded.
    const { slipDetails, components } = installFakeDb([]);

    await SalaryModel.createSalaryFromExcel("EMP1", new Date(2026, 7, 1), excelData, 1);

    expect(components.has("Local Salary")).toBe(true);
    expect(components.has("Provident Fund")).toBe(true);
    expect(components.has("Full Salary")).toBe(true);

    const amountOf = (name: string) => slipDetails.find((d) => d.component === name);
    expect(amountOf("Local Salary")).toMatchObject({ amount: "enc:30000", type: "earning" });
    expect(amountOf("OXO International Salary")).toMatchObject({ amount: "enc:30000", type: "earning" });
    expect(amountOf("Provident Fund")).toMatchObject({ amount: "enc:2400", type: "deduction" });
    expect(amountOf("Allowances")).toMatchObject({ amount: "enc:50000", type: "earning" });
    expect(amountOf("Salary Advance/Deductions")).toMatchObject({ amount: "enc:3000", type: "deduction" });
  });

  it("stores Full Salary including allowances and keeps EPF separate from advances (OCD-573)", async () => {
    const { slipDetails } = installFakeDb(["Full Salary", "Local Salary", "Provident Fund"]);

    const salary: any = await SalaryModel.createSalaryFromExcel("EMP1", new Date(2026, 7, 1), excelData, 1);

    expect(slipDetails.find((d) => d.component === "Full Salary")?.amount).toBe("enc:110000");
    expect(slipDetails.find((d) => d.component === "Provident Fund")?.amount).toBe("enc:2400");
    expect(Number(salary.total_earnings)).toBe(110000);
    expect(Number(salary.total_deductions)).toBe(5400);
    expect(Number(salary.net_salary)).toBe(104600);
  });
});
