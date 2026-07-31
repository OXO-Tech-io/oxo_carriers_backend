import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";

vi.mock("../../src/config/database", () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../../src/middleware/permissions", () => ({
  getUserPermissionAssignments: vi.fn(),
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { getAll: vi.fn(), findById: vi.fn() },
}));

import pool from "../../src/config/database";
import { getUserPermissionAssignments } from "../../src/middleware/permissions";
import { EmployeeModel } from "../../src/employees/Employee";
import { PermissionsService } from "../../src/modules/permissions/permissions.service";
import { PermissionsController } from "../../src/modules/permissions/permissions.controller";

const poolQueryMock = (pool as any).query as ReturnType<typeof vi.fn>;
const poolConnectMock = (pool as any).connect as ReturnType<typeof vi.fn>;
const getAssignmentsMock = getUserPermissionAssignments as unknown as ReturnType<typeof vi.fn>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("PermissionsService", () => {
  const service = new PermissionsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCatalog returns the static permission catalog", () => {
    expect(service.getCatalog().length).toBeGreaterThan(0);
  });

  describe("getManageableUsers", () => {
    it("maps and sorts employees by first/last name", async () => {
      em.getAll.mockResolvedValue([
        { id: 2, email: "b@x.com", firstName: "Bob", lastName: "Zed", role: "employee" },
        { id: 1, email: "a@x.com", firstName: "Alice", lastName: "Anderson", role: "hr_manager" },
      ]);
      const result = await service.getManageableUsers();
      expect(result.map((u) => u.first_name)).toEqual(["Alice", "Bob"]);
    });
  });

  describe("getMyPermissions / getUserPermissions", () => {
    it("returns empty assignments when the employee has no employeeId", async () => {
      em.findById.mockResolvedValue({ employeeId: null });
      const result = await service.getMyPermissions(1);
      expect(result.assignments).toEqual([]);
      expect(result.permissions).toEqual([]);
    });

    it("returns assignments and derived permissionLevels", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP1" });
      getAssignmentsMock.mockResolvedValue([{ key: "leaves", accessLevel: "write" }]);
      const result = await service.getMyPermissions(1);
      expect(result.permissionLevels).toEqual({ leaves: "write" });
      expect(result.permissions).toEqual(["leaves"]);
    });

    it("getUserPermissions throws NotFoundException for a missing user", async () => {
      em.findById.mockResolvedValue(null);
      await expect(service.getUserPermissions(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe("getAllUserPermissions", () => {
    it("groups rows by user_id", async () => {
      poolQueryMock.mockResolvedValue({
        rows: [
          { user_id: 1, permission_key: "leaves", access_level: "read" },
          { user_id: 1, permission_key: "salaries", access_level: "write" },
          { user_id: 2, permission_key: "vendors", access_level: "read" },
        ],
      });
      const result = await service.getAllUserPermissions();
      expect(result.assignments[1]).toHaveLength(2);
      expect(result.permissionLevels[1]).toEqual({ leaves: "read", salaries: "write" });
      expect(result.assignments[2]).toHaveLength(1);
    });
  });

  describe("replaceUserPermissions", () => {
    const createClient = () => ({ query: vi.fn().mockResolvedValue({}), release: vi.fn() });

    it("throws NotFoundException for a missing user", async () => {
      em.findById.mockResolvedValue(null);
      await expect(service.replaceUserPermissions(9, 1, [])).rejects.toThrow(NotFoundException);
    });

    it("rejects a non-object permission entry", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP1" });
      await expect(service.replaceUserPermissions(9, 1, ["not-an-object"])).rejects.toThrow(BadRequestException);
    });

    it("rejects an unknown permission key", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP1" });
      await expect(
        service.replaceUserPermissions(9, 1, [{ key: "unknown_key", accessLevel: "read" }]),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an invalid access level", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP1" });
      await expect(
        service.replaceUserPermissions(9, 1, [{ key: "leaves", accessLevel: "admin" }]),
      ).rejects.toThrow(BadRequestException);
    });

    it("dedupes repeated keys, keeping the first occurrence", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP1" });
      const client = createClient();
      poolConnectMock.mockResolvedValue(client);
      const result = await service.replaceUserPermissions(9, 1, [
        { key: "leaves", accessLevel: "read" },
        { key: "leaves", accessLevel: "write" },
      ]);
      expect(result.assignments).toEqual([{ key: "leaves", accessLevel: "read" }]);
    });

    it("throws BadRequestException when the target has no employeeId", async () => {
      em.findById.mockResolvedValue({ employeeId: null });
      await expect(
        service.replaceUserPermissions(9, 1, [{ key: "leaves", accessLevel: "read" }]),
      ).rejects.toThrow(BadRequestException);
    });

    it("commits the transaction and returns the new assignments", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP1" });
      const client = createClient();
      poolConnectMock.mockResolvedValue(client);
      const result = await service.replaceUserPermissions(9, 1, [{ key: "leaves", accessLevel: "write" }]);
      expect(client.query).toHaveBeenCalledWith("BEGIN");
      expect(client.query).toHaveBeenCalledWith("COMMIT");
      expect(client.release).toHaveBeenCalled();
      expect(result.message).toBe("Permissions updated successfully");
    });

    it("rolls back and rethrows when the insert fails", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP1" });
      const client = createClient();
      client.query.mockImplementation((sql: string) => {
        if (sql.startsWith("INSERT")) return Promise.reject(new Error("insert failed"));
        return Promise.resolve({});
      });
      poolConnectMock.mockResolvedValue(client);
      await expect(
        service.replaceUserPermissions(9, 1, [{ key: "leaves", accessLevel: "write" }]),
      ).rejects.toThrow("insert failed");
      expect(client.query).toHaveBeenCalledWith("ROLLBACK");
      expect(client.release).toHaveBeenCalled();
    });
  });
});

describe("PermissionsController", () => {
  const createServiceMock = () => ({
    getCatalog: vi.fn(),
    getMyPermissions: vi.fn(),
    getManageableUsers: vi.fn(),
    getAllUserPermissions: vi.fn(),
    getUserPermissions: vi.fn(),
    replaceUserPermissions: vi.fn(),
  });

  let service: ReturnType<typeof createServiceMock>;
  let controller: PermissionsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new PermissionsController(service as any);
  });

  it("getUserPermissions rejects a non-numeric id", async () => {
    await expect(controller.getUserPermissions("abc")).rejects.toThrow(BadRequestException);
  });

  it("replaceUserPermissions parses the id and delegates", async () => {
    service.replaceUserPermissions.mockResolvedValue({ message: "ok" });
    const result = await controller.replaceUserPermissions(
      "5",
      { permissions: [{ key: "leaves", accessLevel: "read" }] } as any,
      { userId: 9 } as any,
    );
    expect(service.replaceUserPermissions).toHaveBeenCalledWith(9, 5, [{ key: "leaves", accessLevel: "read" }]);
    expect(result).toEqual({ success: true, message: "ok" });
  });

  it("getPermissionCatalog wraps the catalog", () => {
    service.getCatalog.mockReturnValue([{ key: "leaves" }]);
    const result = controller.getPermissionCatalog();
    expect(result).toEqual({ success: true, permissions: [{ key: "leaves" }] });
  });
});
