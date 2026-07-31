import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/modules/employee-work-history/EmployeeWorkHistory", () => ({
  EmployeeWorkHistoryModel: { listByEmployeeId: vi.fn() },
}));
vi.mock("../../src/modules/employee-work-history/experienceSummary.service", () => ({
  experienceSummaryService: { calculate: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn() },
}));

import { EmployeeWorkHistoryModel } from "../../src/modules/employee-work-history/EmployeeWorkHistory";
import { experienceSummaryService } from "../../src/modules/employee-work-history/experienceSummary.service";
import { EmployeeModel } from "../../src/employees/Employee";
import { EmployeeWorkHistoryService } from "../../src/modules/employee-work-history/employee-work-history.service";
import { EmployeeWorkHistoryController } from "../../src/modules/employee-work-history/employee-work-history.controller";

const listMock = EmployeeWorkHistoryModel.listByEmployeeId as unknown as ReturnType<typeof vi.fn>;
const calculateMock = experienceSummaryService.calculate as unknown as ReturnType<typeof vi.fn>;
const findByIdMock = EmployeeModel.findById as unknown as ReturnType<typeof vi.fn>;

describe("EmployeeWorkHistoryService", () => {
  const service = new EmployeeWorkHistoryService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("lists the caller's own records for a self role", async () => {
      listMock.mockResolvedValue([{ id: 1 }]);
      const result = await service.list("EMP1", UserRole.EMPLOYEE, undefined);
      expect(result).toEqual([{ id: 1 }]);
    });

    it("throws BadRequestException for a self role with no employeeId", async () => {
      await expect(service.list(null, UserRole.EMPLOYEE, undefined)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for HR/admin roles missing the query employeeId", async () => {
      await expect(service.list("EMPHR", UserRole.HR_MANAGER, undefined)).rejects.toThrow(BadRequestException);
    });
  });

  describe("getExperienceSummary", () => {
    it("calculates for the caller's own employeeId when self role", async () => {
      calculateMock.mockResolvedValue({ totalExperienceYears: 3 });
      const result = await service.getExperienceSummary("EMP1", UserRole.EMPLOYEE, undefined);
      expect(calculateMock).toHaveBeenCalledWith("EMP1");
      expect(result).toEqual({ totalExperienceYears: 3 });
    });

    it("throws BadRequestException for a self role with no employeeId", async () => {
      await expect(service.getExperienceSummary(null, UserRole.EMPLOYEE, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("calculates for the queried employeeId for HR roles", async () => {
      calculateMock.mockResolvedValue({ totalExperienceYears: 5 });
      const result = await service.getExperienceSummary("EMPHR", UserRole.HR_MANAGER, "EMP2");
      expect(calculateMock).toHaveBeenCalledWith("EMP2");
      expect(result).toEqual({ totalExperienceYears: 5 });
    });

    it("throws BadRequestException for HR/admin roles missing the query employeeId", async () => {
      await expect(service.getExperienceSummary("EMPHR", UserRole.HR_MANAGER, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

describe("EmployeeWorkHistoryController", () => {
  let service: EmployeeWorkHistoryService;
  let controller: EmployeeWorkHistoryController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmployeeWorkHistoryService();
    controller = new EmployeeWorkHistoryController(service);
  });

  it("list throws NotFoundException when the target employee doesn't exist", async () => {
    findByIdMock.mockResolvedValue(null);
    await expect(
      controller.list(999, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("list returns a success envelope", async () => {
    findByIdMock.mockResolvedValue({ employeeId: "EMP1" });
    listMock.mockResolvedValue([{ id: 1 }]);
    const result = await controller.list(1, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);
    expect(result).toEqual({ success: true, message: "Work history records fetched", data: [{ id: 1 }] });
  });

  it("getExperienceSummary throws NotFoundException when the target employee doesn't exist", async () => {
    findByIdMock.mockResolvedValue(null);
    await expect(
      controller.getExperienceSummary(999, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("getExperienceSummary returns a success envelope", async () => {
    findByIdMock.mockResolvedValue({ employeeId: "EMP1" });
    calculateMock.mockResolvedValue({ totalExperienceYears: 2 });
    const result = await controller.getExperienceSummary(1, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);
    expect(result).toEqual({
      success: true,
      message: "Experience summary calculated",
      data: { totalExperienceYears: 2 },
    });
  });
});
