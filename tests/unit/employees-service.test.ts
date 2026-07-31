import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    findByKeycloakSub: vi.fn(),
    linkKeycloakSub: vi.fn(),
    findOrCreateFromKeycloak: vi.fn(),
    findByEmployeeId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    delete: vi.fn(),
    generateEmployeeId: vi.fn(),
  },
}));

import { EmployeeModel } from "../../src/employees/Employee";
import { EmployeesService } from "../../src/employees/employees.service";
import { UserRole } from "../../src/types";

const m = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("EmployeesService", () => {
  let service: EmployeesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmployeesService();
  });

  it("delegates findByEmail to EmployeeModel", async () => {
    const employee = { id: 1, email: "test@example.com" };
    m.findByEmail.mockResolvedValue(employee);
    const result = await service.findByEmail("test@example.com");
    expect(result).toEqual(employee);
    expect(m.findByEmail).toHaveBeenCalledWith("test@example.com");
  });

  it("delegates findById to EmployeeModel", async () => {
    const employee = { id: 42 };
    m.findById.mockResolvedValue(employee);
    const result = await service.findById(42);
    expect(result).toEqual(employee);
    expect(m.findById).toHaveBeenCalledWith(42);
  });

  it("delegates findByKeycloakSub to EmployeeModel", async () => {
    const employee = { id: 3, sub: "kc-sub-abc" };
    m.findByKeycloakSub.mockResolvedValue(employee);
    const result = await service.findByKeycloakSub("kc-sub-abc");
    expect(result).toEqual(employee);
    expect(m.findByKeycloakSub).toHaveBeenCalledWith("kc-sub-abc");
  });

  it("delegates linkKeycloakSub to EmployeeModel", async () => {
    m.linkKeycloakSub.mockResolvedValue(undefined);
    await service.linkKeycloakSub(5, "kc-sub-xyz");
    expect(m.linkKeycloakSub).toHaveBeenCalledWith(5, "kc-sub-xyz");
  });

  it("delegates findOrCreateFromKeycloak to EmployeeModel", async () => {
    const claims = {
      sub: "kc-sub-001",
      email: "emp@example.com",
      first_name: "Jane",
      last_name: "Doe",
      role: UserRole.EMPLOYEE,
    };
    const employee = { id: 10, ...claims };
    m.findOrCreateFromKeycloak.mockResolvedValue(employee);
    const result = await service.findOrCreateFromKeycloak(claims);
    expect(result).toEqual(employee);
    expect(m.findOrCreateFromKeycloak).toHaveBeenCalledWith(claims);
  });

  it("delegates findByEmployeeId to EmployeeModel", async () => {
    const employee = { id: 7, employeeId: "EMP007" };
    m.findByEmployeeId.mockResolvedValue(employee);
    const result = await service.findByEmployeeId("EMP007");
    expect(result).toEqual(employee);
    expect(m.findByEmployeeId).toHaveBeenCalledWith("EMP007");
  });

  it("delegates create to EmployeeModel", async () => {
    const data = { employeeId: "EMP100", email: "new@example.com" } as any;
    const created = { id: 100, ...data };
    m.create.mockResolvedValue(created);
    const result = await service.create(data);
    expect(result).toEqual(created);
    expect(m.create).toHaveBeenCalledWith(data);
  });

  it("delegates update to EmployeeModel", async () => {
    const updates = { email: "updated@example.com" } as any;
    m.update.mockResolvedValue({ id: 1, ...updates });
    const result = await service.update(1, updates);
    expect(m.update).toHaveBeenCalledWith(1, updates);
    expect(result).toMatchObject(updates);
  });

  it("delegates getAll without filters to EmployeeModel", async () => {
    const employees = [{ id: 1 }, { id: 2 }];
    m.getAll.mockResolvedValue(employees);
    const result = await service.getAll();
    expect(result).toEqual(employees);
    expect(m.getAll).toHaveBeenCalledWith(undefined);
  });

  it("delegates getAll with filters to EmployeeModel", async () => {
    const filters = { role: UserRole.HR_MANAGER } as any;
    m.getAll.mockResolvedValue([]);
    await service.getAll(filters);
    expect(m.getAll).toHaveBeenCalledWith(filters);
  });

  it("delegates delete to EmployeeModel", async () => {
    m.delete.mockResolvedValue(undefined);
    await service.delete(99);
    expect(m.delete).toHaveBeenCalledWith(99);
  });

  it("delegates generateEmployeeId to EmployeeModel", async () => {
    m.generateEmployeeId.mockResolvedValue("EMP999");
    const result = await service.generateEmployeeId();
    expect(result).toBe("EMP999");
    expect(m.generateEmployeeId).toHaveBeenCalled();
  });
});
