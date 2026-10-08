import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { SalaryController } from "../../src/modules/salary/salary.controller";

const createServiceMock = () => ({
  getComponents: vi.fn(),
  getYearToDateEarnings: vi.fn(),
  getSalaries: vi.fn(),
  getSalaryById: vi.fn(),
  generateSalarySlipPdf: vi.fn(),
  getEmployeeSalaryStructure: vi.fn(),
  generateSalary: vi.fn(),
  uploadBulkSalaries: vi.fn(),
  updateSalaryStructure: vi.fn(),
  updateSalaryStatus: vi.fn(),
});

const createRes = () => ({ setHeader: vi.fn(), send: vi.fn() });
const employee = { userId: 1 } as any;

describe("SalaryController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: SalaryController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new SalaryController(service as any);
  });

  it("getYtd wraps the service result", async () => {
    service.getYearToDateEarnings.mockResolvedValue({ year: 2026, totalNet: 100 });
    const result = await controller.getYtd(employee, "2026");
    expect(result).toEqual({ success: true, year: 2026, totalNet: 100 });
  });

  it("getSalarySlipPdf sends a PDF with the right headers", async () => {
    service.generateSalarySlipPdf.mockResolvedValue(Buffer.from("pdf"));
    const res = createRes();
    await controller.getSalarySlipPdf(9, employee, res as any);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'inline; filename="salary-slip-9.pdf"',
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from("pdf"));
  });

  it("bulkUpload requires a file", async () => {
    await expect(controller.bulkUpload(undefined as any, { month: "8", year: "2026" } as any, employee)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("bulkUpload summarizes success/failure counts in the message", async () => {
    service.uploadBulkSalaries.mockResolvedValue({ success: 3, failed: 2, errors: ["e1", "e2"] });
    const result = await controller.bulkUpload(
      { path: "/tmp/f.xlsx" } as any,
      { month: "8", year: "2026" } as any,
      employee,
    );
    expect(result.message).toBe("Processed 3 salaries successfully, 2 failed");
    expect(result.results.errors).toEqual(["e1", "e2"]);
  });

  it("bulkUpload omits the failure clause when everything succeeds", async () => {
    service.uploadBulkSalaries.mockResolvedValue({ success: 5, failed: 0, errors: [] });
    const result = await controller.bulkUpload(
      { path: "/tmp/f.xlsx" } as any,
      { month: "8", year: "2026" } as any,
      employee,
    );
    expect(result.message).toBe("Processed 5 salaries successfully");
  });

  it("updateStructure returns a confirmation message", async () => {
    const result = await controller.updateStructure(1, { components: [] } as any, employee);
    expect(result).toEqual({ success: true, message: "Salary structure updated successfully" });
  });

  it("updateStatus wraps the updated salary", async () => {
    service.updateSalaryStatus.mockResolvedValue({ id: 1, status: "paid" });
    const result = await controller.updateStatus(1, { status: "paid" } as any, employee);
    expect(result).toEqual({ success: true, message: "Salary status updated", salary: { id: 1, status: "paid" } });
  });
});
