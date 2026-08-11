import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportsController } from "../../src/modules/reports/reports.controller";

const createServiceMock = () => ({
  getLeaveReportData: vi.fn(),
  buildLeaveReportWorkbook: vi.fn(),
  getSalaryReportData: vi.fn(),
  buildSalaryReportWorkbook: vi.fn(),
  getDashboardMetrics: vi.fn(),
  getSubmissionsBreakdown: vi.fn(),
  buildSubmissionsBreakdownWorkbook: vi.fn(),
});

const createRes = () => ({
  setHeader: vi.fn(),
  json: vi.fn(),
  end: vi.fn(),
});

const createWorkbookStub = () => ({ xlsx: { write: vi.fn().mockResolvedValue(undefined) } });

describe("ReportsController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: ReportsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new ReportsController(service as any);
  });

  describe("leaveReport", () => {
    it("returns JSON with a count when format isn't excel", async () => {
      service.getLeaveReportData.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const res = createRes();
      await controller.leaveReport(res as any, "Eng", "2026");
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }, { id: 2 }], count: 2 });
    });

    it("streams an xlsx workbook when format=excel", async () => {
      service.getLeaveReportData.mockResolvedValue([]);
      const workbook = createWorkbookStub();
      service.buildLeaveReportWorkbook.mockReturnValue(workbook);
      const res = createRes();
      await controller.leaveReport(res as any, "Eng", "2026", "07", "approved", "excel");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "attachment; filename=leave-report-2026-07.xlsx",
      );
      expect(workbook.xlsx.write).toHaveBeenCalledWith(res);
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe("salaryReport", () => {
    it("returns JSON by default", async () => {
      service.getSalaryReportData.mockResolvedValue([{ id: 1 }]);
      const res = createRes();
      await controller.salaryReport(res as any);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }], count: 1 });
    });

    it("streams xlsx with a filename derived from year/month", async () => {
      service.getSalaryReportData.mockResolvedValue([]);
      const workbook = createWorkbookStub();
      service.buildSalaryReportWorkbook.mockReturnValue(workbook);
      const res = createRes();
      await controller.salaryReport(res as any, undefined, "2026", undefined, "excel");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "attachment; filename=salary-report-2026.xlsx",
      );
    });
  });

  it("dashboard wraps metrics in a success envelope", async () => {
    service.getDashboardMetrics.mockResolvedValue({ totalEmployees: 5 });
    const result = await controller.dashboard();
    expect(result).toEqual({ success: true, metrics: { totalEmployees: 5 } });
  });

  describe("submissionsBreakdown", () => {
    it("converts formId/communicationId to numbers and returns JSON", async () => {
      service.getSubmissionsBreakdown.mockResolvedValue({ summary: {} });
      const res = createRes();
      await controller.submissionsBreakdown(res as any, "Eng", "EMP1", "3", "4");
      expect(service.getSubmissionsBreakdown).toHaveBeenCalledWith(
        expect.objectContaining({ department: "Eng", employeeId: "EMP1", formId: 3, communicationId: 4 }),
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, summary: {} });
    });

    it("streams an xlsx workbook when format=excel", async () => {
      service.getSubmissionsBreakdown.mockResolvedValue({});
      const workbook = createWorkbookStub();
      service.buildSubmissionsBreakdownWorkbook.mockReturnValue(workbook);
      const res = createRes();
      await controller.submissionsBreakdown(
        res as any,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "excel",
      );
      expect(workbook.xlsx.write).toHaveBeenCalledWith(res);
      expect(res.end).toHaveBeenCalled();
    });
  });
});
