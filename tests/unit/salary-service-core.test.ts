import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { SalaryStatus, UserRole } from "../../src/types";

vi.mock("../../src/modules/salary/Salary", () => ({
  SalaryModel: {
    getComponents: vi.fn(),
    getEmployeeSalaryStructure: vi.fn(),
    updateSalaryStructure: vi.fn(),
    findByEmployeeId: vi.fn(),
    generateSalary: vi.fn(),
    getAll: vi.fn(),
    findById: vi.fn(),
    getSlipDetails: vi.fn(),
    updatePdfUrl: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn(), findByEmployeeId: vi.fn() },
}));
vi.mock("../../src/utils/pdfGenerator", () => ({
  generateSalarySlipPDF: vi.fn(),
}));
vi.mock("../../src/config/email", () => ({
  sendPayslipAvailableEmail: vi.fn(),
}));
vi.mock("../../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("fs", () => ({
  default: { existsSync: vi.fn().mockReturnValue(true), mkdirSync: vi.fn(), writeFileSync: vi.fn(), unlinkSync: vi.fn() },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { SalaryModel } from "../../src/modules/salary/Salary";
import { EmployeeModel } from "../../src/employees/Employee";
import { generateSalarySlipPDF } from "../../src/utils/pdfGenerator";
import { sendPayslipAvailableEmail } from "../../src/config/email";
import { SalaryService } from "../../src/modules/salary/salary.service";

const sm = SalaryModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const generatePdfMock = generateSalarySlipPDF as unknown as ReturnType<typeof vi.fn>;
const sendPayslipMock = sendPayslipAvailableEmail as unknown as ReturnType<typeof vi.fn>;

const employeeUser = { userId: 5, employeeId: "EMP5", role: UserRole.EMPLOYEE } as any;
const hr = { userId: 2, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("SalaryService", () => {
  const service = new SalaryService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getEmployeeSalaryStructure", () => {
    it("forbids an employee viewing someone else's structure", async () => {
      await expect(service.getEmployeeSalaryStructure(999, employeeUser)).rejects.toThrow(ForbiddenException);
    });

    it("resolves the employeeId and returns the structure", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP5" });
      sm.getEmployeeSalaryStructure.mockResolvedValue([{ component: "basic" }]);
      const result = await service.getEmployeeSalaryStructure(5, employeeUser);
      expect(result).toEqual([{ component: "basic" }]);
    });

    it("throws BadRequestException when the target has no employeeId", async () => {
      em.findById.mockResolvedValue({ employeeId: null });
      await expect(service.getEmployeeSalaryStructure(5, hr)).rejects.toThrow(BadRequestException);
    });
  });

  describe("updateSalaryStructure", () => {
    it("forbids non-HR-manager roles", async () => {
      await expect(service.updateSalaryStructure(5, { components: [] } as any, hr === hr ? { ...hr, role: UserRole.HR_EXECUTIVE } : hr)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("allows HR_MANAGER to update", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP5" });
      await service.updateSalaryStructure(5, { components: [{ key: "basic", amount: 100 }] } as any, hr);
      expect(sm.updateSalaryStructure).toHaveBeenCalledWith("EMP5", [{ key: "basic", amount: 100 }]);
    });
  });

  describe("generateSalary", () => {
    const dto = { userId: "5", month: 8, year: 2026 } as any;

    it("forbids non-HR roles", async () => {
      await expect(service.generateSalary(dto, employeeUser)).rejects.toThrow(ForbiddenException);
    });

    it("requires userId/month/year", async () => {
      await expect(service.generateSalary({ userId: "5" } as any, hr)).rejects.toThrow(BadRequestException);
    });

    it("rejects generating a duplicate month", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP5" });
      sm.findByEmployeeId.mockResolvedValue([{ id: 1 }]);
      await expect(service.generateSalary(dto, hr)).rejects.toThrow(BadRequestException);
    });

    it("generates the salary and fires a payslip email", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP5", email: "e@x.com", firstName: "A", lastName: "B" });
      sm.findByEmployeeId.mockResolvedValue([]);
      sm.generateSalary.mockResolvedValue({ id: 1, net_salary: "1000", total_earnings: "1200", total_deductions: "200" });
      sendPayslipMock.mockResolvedValue(undefined);

      const result = await service.generateSalary(dto, hr);
      expect(result.id).toBe(1);
      await flush();
      expect(sendPayslipMock).toHaveBeenCalled();
    });
  });

  describe("getSalaries", () => {
    it("scopes an employee to their own salaries", async () => {
      sm.findByEmployeeId.mockResolvedValue([{ id: 1 }]);
      const result = await service.getSalaries(employeeUser, {});
      expect(sm.findByEmployeeId).toHaveBeenCalledWith("EMP5", { year: undefined, month: undefined });
      expect(result).toEqual([{ id: 1 }]);
    });

    it("requires an employeeId for the employee role", async () => {
      await expect(service.getSalaries({ ...employeeUser, employeeId: null }, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it("resolves userId filter to an employeeId for HR queries", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP9" });
      sm.getAll.mockResolvedValue([]);
      await service.getSalaries(hr, { userId: "9", year: "2026" });
      expect(sm.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "EMP9", year: 2026 }),
      );
    });
  });

  describe("getSalaryById", () => {
    it("throws NotFoundException when missing", async () => {
      sm.findById.mockResolvedValue(null);
      await expect(service.getSalaryById(1, hr)).rejects.toThrow(NotFoundException);
    });

    it("forbids an employee viewing another employee's salary", async () => {
      sm.findById.mockResolvedValue({ id: 1, employee_id: "OTHER" });
      await expect(service.getSalaryById(1, employeeUser)).rejects.toThrow(ForbiddenException);
    });

    it("returns salary + details for a valid request", async () => {
      sm.findById.mockResolvedValue({ id: 1, employee_id: "EMP5" });
      sm.getSlipDetails.mockResolvedValue({ items: [] });
      const result = await service.getSalaryById(1, employeeUser);
      expect(result).toEqual({ salary: { id: 1, employee_id: "EMP5" }, details: { items: [] } });
    });
  });

  describe("generateSalarySlipPdf", () => {
    it("throws NotFoundException when the salary doesn't exist", async () => {
      sm.findById.mockResolvedValue(null);
      await expect(service.generateSalarySlipPdf(1, hr)).rejects.toThrow(NotFoundException);
    });

    it("forbids an employee from generating another's slip", async () => {
      sm.findById.mockResolvedValue({ id: 1, employee_id: "OTHER" });
      await expect(service.generateSalarySlipPdf(1, employeeUser)).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when PDF generation fails", async () => {
      sm.findById.mockResolvedValue({ id: 1, employee_id: "EMP5" });
      sm.getSlipDetails.mockResolvedValue({});
      em.findByEmployeeId.mockResolvedValue({ employeeId: "EMP5", firstName: "A", lastName: "B" });
      generatePdfMock.mockRejectedValue(new Error("pdf failure"));
      await expect(service.generateSalarySlipPdf(1, hr)).rejects.toThrow(BadRequestException);
    });

    it("returns the pdf buffer and persists pdf_url when not already saved", async () => {
      sm.findById.mockResolvedValue({ id: 1, employee_id: "EMP5", pdf_url: null });
      sm.getSlipDetails.mockResolvedValue({});
      em.findByEmployeeId.mockResolvedValue({ employeeId: "EMP5", firstName: "A", lastName: "B" });
      generatePdfMock.mockResolvedValue(Buffer.from("pdf-data"));
      const result = await service.generateSalarySlipPdf(1, hr);
      expect(result).toEqual(Buffer.from("pdf-data"));
      expect(sm.updatePdfUrl).toHaveBeenCalledWith(1, expect.stringContaining("/uploads/salary-slips/"));
    });

    it("skips re-saving when pdf_url already exists", async () => {
      sm.findById.mockResolvedValue({ id: 1, employee_id: "EMP5", pdf_url: "/existing.pdf" });
      sm.getSlipDetails.mockResolvedValue({});
      em.findByEmployeeId.mockResolvedValue({ employeeId: "EMP5", firstName: "A", lastName: "B" });
      generatePdfMock.mockResolvedValue(Buffer.from("pdf-data"));
      await service.generateSalarySlipPdf(1, hr);
      expect(sm.updatePdfUrl).not.toHaveBeenCalled();
    });
  });

  describe("updateSalaryStatus", () => {
    it("forbids non-HR roles", async () => {
      await expect(service.updateSalaryStatus(1, { status: SalaryStatus.PAID } as any, employeeUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("requires a status", async () => {
      await expect(service.updateSalaryStatus(1, {} as any, hr)).rejects.toThrow(BadRequestException);
    });

    it("fires a paid email when the new status is PAID", async () => {
      sm.updateStatus.mockResolvedValue({ id: 1, employee_id: "EMP5", net_salary: "1000", total_earnings: "1100", total_deductions: "100", month_year: "2026-08-01" });
      em.findByEmployeeId.mockResolvedValue({ email: "e@x.com", firstName: "A", lastName: "B" });
      sendPayslipMock.mockResolvedValue(undefined);
      await service.updateSalaryStatus(1, { status: SalaryStatus.PAID } as any, hr);
      await flush();
      expect(sendPayslipMock).toHaveBeenCalled();
    });

    it("doesn't send an email for non-paid statuses", async () => {
      sm.updateStatus.mockResolvedValue({ id: 1 });
      await service.updateSalaryStatus(1, { status: SalaryStatus.GENERATED } as any, hr);
      await flush();
      expect(sendPayslipMock).not.toHaveBeenCalled();
    });
  });

  describe("getYearToDateEarnings", () => {
    it("requires an employeeId", async () => {
      await expect(service.getYearToDateEarnings({ ...employeeUser, employeeId: null })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("sums earnings/deductions/net across the year's salaries", async () => {
      sm.findByEmployeeId.mockResolvedValue([
        { total_earnings: "1000", total_deductions: "100", net_salary: "900" },
        { total_earnings: "2000", total_deductions: "200", net_salary: "1800" },
      ]);
      const result = await service.getYearToDateEarnings(employeeUser, "2026");
      expect(result).toEqual({ year: 2026, totalEarnings: 3000, totalDeductions: 300, totalNet: 2700, salaryCount: 2 });
    });
  });
});
