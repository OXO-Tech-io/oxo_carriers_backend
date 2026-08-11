import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { WorkLogsService } from "../../src/modules/work-logs/work-logs.service";
import { WorkLogsController } from "../../src/modules/work-logs/work-logs.controller";

vi.mock("../../src/modules/work-logs/workLog.service", () => ({
  workLogService: {
    submitEntries: vi.fn(),
    listMine: vi.fn(),
    listAll: vi.fn(),
    getSummary: vi.fn(),
    generateSummaryReport: vi.fn(),
    generateDetailedReport: vi.fn(),
    generateTemplate: vi.fn(),
    bulkUpload: vi.fn(),
  },
}));

import { workLogService } from "../../src/modules/work-logs/workLog.service";

const wls = workLogService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const employee = { employeeId: "EMP1" } as any;

describe("WorkLogsService (thin wrapper)", () => {
  const service = new WorkLogsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitEntries forwards employeeId and entries", () => {
    service.submitEntries("EMP1", { entries: [{ workDate: "2026-01-01" }] } as any);
    expect(wls.submitEntries).toHaveBeenCalledWith("EMP1", [{ workDate: "2026-01-01" }]);
  });

  it("listMine forwards from/to filters", () => {
    service.listMine("EMP1", { from: "2026-01-01", to: "2026-01-31" } as any);
    expect(wls.listMine).toHaveBeenCalledWith("EMP1", { from: "2026-01-01", to: "2026-01-31" });
  });

  it("listAll forwards userId/from/to", () => {
    service.listAll({ userId: 5, from: "2026-01-01", to: "2026-01-31" } as any);
    expect(wls.listAll).toHaveBeenCalledWith({ userId: 5, from: "2026-01-01", to: "2026-01-31" });
  });

  it("bulkUpload requires a file", async () => {
    await expect(service.bulkUpload("EMP1", undefined)).rejects.toThrow(BadRequestException);
  });

  it("bulkUpload delegates with the uploaded file's path", async () => {
    wls.bulkUpload.mockResolvedValue({ success: 1, failed: 0, errors: [] });
    await service.bulkUpload("EMP1", { path: "/tmp/file.xlsx" } as any);
    expect(wls.bulkUpload).toHaveBeenCalledWith("EMP1", "/tmp/file.xlsx");
  });
});

describe("WorkLogsController", () => {
  const createServiceMock = () => ({
    generateTemplate: vi.fn(),
    listMine: vi.fn(),
    listAll: vi.fn(),
    getSummary: vi.fn(),
    generateSummaryReport: vi.fn(),
    generateDetailedReport: vi.fn(),
    submitEntries: vi.fn(),
    bulkUpload: vi.fn(),
  });
  const createRes = () => ({ setHeader: vi.fn(), send: vi.fn() });

  let service: ReturnType<typeof createServiceMock>;
  let controller: WorkLogsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new WorkLogsController(service as any);
  });

  it("downloadTemplate streams an xlsx buffer with the right headers", async () => {
    service.generateTemplate.mockResolvedValue(Buffer.from("data"));
    const res = createRes();
    await controller.downloadTemplate(res as any);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      "attachment; filename=work-log-template.xlsx",
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from("data"));
  });

  it("listMine wraps the service result", async () => {
    service.listMine.mockResolvedValue([{ id: 1 }]);
    const result = await controller.listMine({} as any, employee);
    expect(service.listMine).toHaveBeenCalledWith("EMP1", {});
    expect(result).toEqual({ success: true, message: "Work logs fetched", data: [{ id: 1 }] });
  });

  it("submit wraps the service result", async () => {
    service.submitEntries.mockResolvedValue([{ id: 1 }]);
    const result = await controller.submit({ entries: [] } as any, employee);
    expect(result).toEqual({ success: true, message: "Work log entries submitted", data: [{ id: 1 }] });
  });

  it("bulkUpload wraps the service result", async () => {
    service.bulkUpload.mockResolvedValue({ success: 2, failed: 0, errors: [] });
    const result = await controller.bulkUpload({ path: "/tmp/x.xlsx" } as any, employee);
    expect(service.bulkUpload).toHaveBeenCalledWith("EMP1", { path: "/tmp/x.xlsx" });
    expect(result.data).toEqual({ success: 2, failed: 0, errors: [] });
  });
});
