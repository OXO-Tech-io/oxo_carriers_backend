import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import { UserRole } from "../../src/types";

const createContext = (employee: unknown, requiredRoles: UserRole[] | undefined) => {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(requiredRoles) };
  const request = { employee };
  const context: any = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { reflector, context };
};

describe("RolesGuard", () => {
  it("allows access when no roles are required", () => {
    const { reflector, context } = createContext(undefined, undefined);
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows access when required roles is an empty array", () => {
    const { reflector, context } = createContext(undefined, []);
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("throws UnauthorizedException when no employee is on the request", () => {
    const { reflector, context } = createContext(undefined, [UserRole.HR_MANAGER]);
    const guard = new RolesGuard(reflector as any);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("allows a super admin regardless of the required roles", () => {
    const { reflector, context } = createContext({ role: UserRole.SUPER_ADMIN }, [UserRole.HR_MANAGER]);
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows an employee whose role is in the required list", () => {
    const { reflector, context } = createContext({ role: UserRole.HR_MANAGER }, [UserRole.HR_MANAGER]);
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("throws ForbiddenException for a role not in the required list", () => {
    const { reflector, context } = createContext({ role: UserRole.EMPLOYEE }, [UserRole.HR_MANAGER]);
    const guard = new RolesGuard(reflector as any);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
