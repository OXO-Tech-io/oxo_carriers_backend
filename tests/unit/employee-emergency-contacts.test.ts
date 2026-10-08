import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/modules/employee-emergency-contacts/EmployeeEmergencyContact", () => ({
  EmployeeEmergencyContactModel: { listByEmployeeId: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn() },
}));

import { EmployeeEmergencyContactModel } from "../../src/modules/employee-emergency-contacts/EmployeeEmergencyContact";
import { EmployeeModel } from "../../src/employees/Employee";
import { EmployeeEmergencyContactsService } from "../../src/modules/employee-emergency-contacts/employee-emergency-contacts.service";
import { EmployeeEmergencyContactsController } from "../../src/modules/employee-emergency-contacts/employee-emergency-contacts.controller";

const listMock = EmployeeEmergencyContactModel.listByEmployeeId as unknown as ReturnType<typeof vi.fn>;
const findByIdMock = EmployeeModel.findById as unknown as ReturnType<typeof vi.fn>;

describe("EmployeeEmergencyContactsService", () => {
  const service = new EmployeeEmergencyContactsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the caller's own records for a self role", async () => {
    listMock.mockResolvedValue([{ id: 1 }]);
    const result = await service.list("EMP1", UserRole.CONSULTANT, undefined);
    expect(result).toEqual([{ id: 1 }]);
    expect(listMock).toHaveBeenCalledWith("EMP1");
  });

  it("throws BadRequestException for a self role with no employeeId", async () => {
    await expect(service.list(null, UserRole.SERVICE_PROVIDER, undefined)).rejects.toThrow(BadRequestException);
  });

  it("lists another employee's records for HR/admin roles via query param", async () => {
    listMock.mockResolvedValue([{ id: 2 }]);
    const result = await service.list("EMPHR", UserRole.SUPER_ADMIN, "EMP2");
    expect(result).toEqual([{ id: 2 }]);
    expect(listMock).toHaveBeenCalledWith("EMP2");
  });

  it("throws BadRequestException for HR/admin roles missing the query employeeId", async () => {
    await expect(service.list("EMPHR", UserRole.HR_MANAGER, undefined)).rejects.toThrow(BadRequestException);
  });
});

describe("EmployeeEmergencyContactsController", () => {
  let service: EmployeeEmergencyContactsService;
  let controller: EmployeeEmergencyContactsController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmployeeEmergencyContactsService();
    controller = new EmployeeEmergencyContactsController(service);
  });

  it("throws NotFoundException when the target employee doesn't exist", async () => {
    findByIdMock.mockResolvedValue(null);
    await expect(
      controller.list(999, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns a success envelope with the emergency contact records", async () => {
    findByIdMock.mockResolvedValue({ employeeId: "EMP1" });
    listMock.mockResolvedValue([{ id: 1, name: "John" }]);
    const result = await controller.list(1, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);
    expect(result).toEqual({
      success: true,
      message: "Emergency contact records fetched",
      data: [{ id: 1, name: "John" }],
    });
  });
});
