import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "../../src/types";
import { CommunicationsController } from "../../src/modules/communications/communications.controller";

const createServiceMock = () => ({
  respond: vi.fn(),
  listMine: vi.fn(),
  listAll: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  generateReport: vi.fn(),
});

const createRes = () => ({
  setHeader: vi.fn(),
  send: vi.fn(),
});

describe("CommunicationsController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: CommunicationsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new CommunicationsController(service as any);
  });

  describe("respond", () => {
    it("parses the id and delegates to the service", async () => {
      service.respond.mockResolvedValue({});
      const result = await controller.respond(
        { employeeId: "EMP1" } as any,
        "5",
        { responseText: "ack" } as any,
      );
      expect(service.respond).toHaveBeenCalledWith(5, "EMP1", { responseText: "ack" });
      expect(result).toEqual({ success: true, message: "Response recorded", data: {} });
    });

    it("throws BadRequestException for a non-numeric id", async () => {
      await expect(
        controller.respond({ employeeId: "EMP1" } as any, "abc", {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("list", () => {
    it("returns the caller's own inbox when employee_id matches the caller", async () => {
      service.listMine.mockResolvedValue([{ id: 1 }]);
      const result = await controller.list("EMP1", { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);
      expect(service.listMine).toHaveBeenCalledWith("EMP1");
      expect(result.data).toEqual([{ id: 1 }]);
    });

    it("forbids viewing another employee's inbox for a non-HR caller", async () => {
      await expect(
        controller.list("EMP2", { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows HR to view another employee's inbox", async () => {
      service.listMine.mockResolvedValue([{ id: 2 }]);
      const result = await controller.list("EMP2", { employeeId: "EMPHR", role: UserRole.HR_MANAGER } as any);
      expect(service.listMine).toHaveBeenCalledWith("EMP2");
      expect(result.data).toEqual([{ id: 2 }]);
    });

    it("returns the full list for HR when no employee_id is given", async () => {
      service.listAll.mockResolvedValue([{ id: 3 }]);
      const result = await controller.list(undefined, { employeeId: "EMPHR", role: UserRole.HR_EXECUTIVE } as any);
      expect(result.data).toEqual([{ id: 3 }]);
    });

    it("forbids a non-HR caller from listing all communications", async () => {
      await expect(
        controller.list(undefined, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it("create delegates to the service with the current employee's userId", async () => {
    service.create.mockResolvedValue({ id: 1 });
    const result = await controller.create({ userId: 9 } as any, { title: "t" }, undefined);
    expect(service.create).toHaveBeenCalledWith(9, { title: "t" }, []);
    expect(result).toEqual({ success: true, message: "Communication sent", data: { id: 1 } });
  });

  describe("delete", () => {
    it("throws BadRequestException for a non-numeric id", async () => {
      await expect(controller.delete("abc")).rejects.toThrow(BadRequestException);
    });

    it("deletes and returns a success envelope", async () => {
      service.delete.mockResolvedValue(undefined);
      const result = await controller.delete("7");
      expect(service.delete).toHaveBeenCalledWith(7);
      expect(result).toEqual({ success: true, message: "Communication deleted" });
    });
  });

  describe("report / reportById", () => {
    it("streams the full report as an xlsx attachment", async () => {
      service.generateReport.mockResolvedValue(Buffer.from("xlsx"));
      const res = createRes();
      await controller.report(res as any);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(res.send).toHaveBeenCalledWith(Buffer.from("xlsx"));
    });

    it("streams a per-communication report with the id in the filename", async () => {
      service.generateReport.mockResolvedValue(Buffer.from("xlsx"));
      const res = createRes();
      await controller.reportById("4", res as any);
      expect(service.generateReport).toHaveBeenCalledWith(4);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "attachment; filename=communication-4-report.xlsx",
      );
    });

    it("reportById throws BadRequestException for a non-numeric id", async () => {
      await expect(controller.reportById("abc", createRes() as any)).rejects.toThrow(BadRequestException);
    });
  });
});
