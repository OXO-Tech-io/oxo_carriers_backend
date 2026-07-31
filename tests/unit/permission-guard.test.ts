import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/middleware/permissions", () => ({
  hasPermission: vi.fn(),
}));

import { hasPermission } from "../../src/middleware/permissions";
import { PermissionGuard } from "../../src/common/guards/permission.guard";

const hasPermissionMock = hasPermission as unknown as ReturnType<typeof vi.fn>;

const createContext = (employee: unknown, required: { key: string; level: string } | undefined) => {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) };
  const request = { employee };
  const context: any = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { reflector, context };
};

describe("PermissionGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows access when no permission is required", async () => {
    const { reflector, context } = createContext(undefined, undefined);
    const guard = new PermissionGuard(reflector as any);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("throws UnauthorizedException when there is no employee on the request", async () => {
    const { reflector, context } = createContext(undefined, { key: "vouchers", level: "read" });
    const guard = new PermissionGuard(reflector as any);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("allows a super admin without checking hasPermission", async () => {
    const { reflector, context } = createContext(
      { role: UserRole.SUPER_ADMIN, employeeId: "EMP1" },
      { key: "vouchers", level: "write" },
    );
    const guard = new PermissionGuard(reflector as any);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermissionMock).not.toHaveBeenCalled();
  });

  it("throws ForbiddenException when the employee has no employeeId", async () => {
    const { reflector, context } = createContext(
      { role: UserRole.EMPLOYEE, employeeId: null },
      { key: "vouchers", level: "read" },
    );
    const guard = new PermissionGuard(reflector as any);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it("allows access when hasPermission resolves true", async () => {
    hasPermissionMock.mockResolvedValue(true);
    const { reflector, context } = createContext(
      { role: UserRole.EMPLOYEE, employeeId: "EMP1" },
      { key: "vouchers", level: "read" },
    );
    const guard = new PermissionGuard(reflector as any);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermissionMock).toHaveBeenCalledWith("EMP1", "vouchers", "read");
  });

  it("throws ForbiddenException when hasPermission resolves false", async () => {
    hasPermissionMock.mockResolvedValue(false);
    const { reflector, context } = createContext(
      { role: UserRole.EMPLOYEE, employeeId: "EMP1" },
      { key: "vouchers", level: "write" },
    );
    const guard = new PermissionGuard(reflector as any);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
