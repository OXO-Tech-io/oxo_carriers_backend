import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/modules/employee-education/EmployeeEducation", () => ({
  EmployeeEducationModel: { listByEmployeeId: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn() },
}));

import { EmployeeEducationModel } from "../../src/modules/employee-education/EmployeeEducation";
import { EmployeeModel } from "../../src/employees/Employee";
import { EmployeeEducationService } from "../../src/modules/employee-education/employee-education.service";
import { EmployeeEducationController } from "../../src/modules/employee-education/employee-education.controller";

const listMock = EmployeeEducationModel.listByEmployeeId as unknown as ReturnType<typeof vi.fn>;
const findByIdMock = EmployeeModel.findById as unknown as ReturnType<typeof vi.fn>;

describe("EmployeeEducationService", () => {
  const service = new EmployeeEducationService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the caller's own records for a self role", async () => {
    listMock.mockResolvedValue([{ id: 1 }]);
    const result = await service.list("EMP1", UserRole.EMPLOYEE, undefined);
    expect(result).toEqual([{ id: 1 }]);
    expect(listMock).toHaveBeenCalledWith("EMP1");
  });

  it("throws BadRequestException for a self role with no employeeId", async () => {
    await expect(service.list(null, UserRole.EMPLOYEE, undefined)).rejects.toThrow(BadRequestException);
  });

  it("lists another employee's records for HR/admin roles via query param", async () => {
    listMock.mockResolvedValue([{ id: 2 }]);
    const result = await service.list("EMPHR", UserRole.HR_MANAGER, "EMP2");
    expect(result).toEqual([{ id: 2 }]);
    expect(listMock).toHaveBeenCalledWith("EMP2");
  });

  it("throws BadRequestException for HR/admin roles missing the query employeeId", async () => {
    await expect(service.list("EMPHR", UserRole.HR_MANAGER, undefined)).rejects.toThrow(BadRequestException);
  });
});

describe("EmployeeEducationController", () => {
  let service: EmployeeEducationService;
  let controller: EmployeeEducationController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmployeeEducationService();
    controller = new EmployeeEducationController(service);
  });

  it("throws NotFoundException when the target employee doesn't exist", async () => {
    findByIdMock.mockResolvedValue(null);
    await expect(
      controller.list(999, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns a success envelope with the education records", async () => {
    findByIdMock.mockResolvedValue({ employeeId: "EMP1" });
    listMock.mockResolvedValue([{ id: 1, qualificationTitle: "BSc" }]);
    const result = await controller.list(1, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);
    expect(result).toEqual({
      success: true,
      message: "Education records fetched",
      data: [{ id: 1, qualificationTitle: "BSc" }],
    });
  });
});
