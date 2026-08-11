import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/modules/employee-welfare-info/EmployeeWelfareInfo", () => ({
  EmployeeWelfareInfoModel: { findByEmployeeId: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn() },
}));

import { EmployeeWelfareInfoModel } from "../../src/modules/employee-welfare-info/EmployeeWelfareInfo";
import { EmployeeModel } from "../../src/employees/Employee";
import { EmployeeWelfareInfoService } from "../../src/modules/employee-welfare-info/employee-welfare-info.service";
import { EmployeeWelfareInfoController } from "../../src/modules/employee-welfare-info/employee-welfare-info.controller";

const findMock = EmployeeWelfareInfoModel.findByEmployeeId as unknown as ReturnType<typeof vi.fn>;
const findByIdMock = EmployeeModel.findById as unknown as ReturnType<typeof vi.fn>;

describe("EmployeeWelfareInfoService", () => {
  const service = new EmployeeWelfareInfoService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the caller's own record for a self role", async () => {
    findMock.mockResolvedValue({ hobbies: "Reading" });
    const result = await service.get("EMP1", UserRole.EMPLOYEE, undefined);
    expect(result).toEqual({ hobbies: "Reading" });
    expect(findMock).toHaveBeenCalledWith("EMP1");
  });

  it("throws BadRequestException for a self role with no employeeId", async () => {
    await expect(service.get(null, UserRole.EMPLOYEE, undefined)).rejects.toThrow(BadRequestException);
  });

  it("returns another employee's record for HR/admin roles via query param", async () => {
    findMock.mockResolvedValue({ hobbies: "Cycling" });
    const result = await service.get("EMPHR", UserRole.HR_MANAGER, "EMP2");
    expect(result).toEqual({ hobbies: "Cycling" });
    expect(findMock).toHaveBeenCalledWith("EMP2");
  });

  it("throws BadRequestException for HR/admin roles missing the query employeeId", async () => {
    await expect(service.get("EMPHR", UserRole.HR_MANAGER, undefined)).rejects.toThrow(BadRequestException);
  });
});

describe("EmployeeWelfareInfoController", () => {
  let service: EmployeeWelfareInfoService;
  let controller: EmployeeWelfareInfoController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmployeeWelfareInfoService();
    controller = new EmployeeWelfareInfoController(service);
  });

  it("throws NotFoundException when the target employee doesn't exist", async () => {
    findByIdMock.mockResolvedValue(null);
    await expect(
      controller.get(999, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns a success envelope with the welfare record", async () => {
    findByIdMock.mockResolvedValue({ employeeId: "EMP1" });
    findMock.mockResolvedValue({ hobbies: "Reading" });
    const result = await controller.get(1, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);
    expect(result).toEqual({
      success: true,
      message: "Welfare info fetched",
      data: { hobbies: "Reading" },
    });
  });
});
