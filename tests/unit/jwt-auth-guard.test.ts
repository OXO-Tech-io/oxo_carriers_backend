import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/middleware/keycloakAuth", () => ({
  verifyKeycloakToken: vi.fn(),
}));

import { verifyKeycloakToken } from "../../src/middleware/keycloakAuth";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { IS_PUBLIC_KEY } from "../../src/common/decorators/public.decorator";
import { SKIP_SESSION_CHECK_KEY } from "../../src/common/decorators/skip-session-check.decorator";

const verifyMock = verifyKeycloakToken as unknown as ReturnType<typeof vi.fn>;

const createContext = (
  headers: Record<string, string>,
  isPublic: boolean | undefined,
  skipSessionCheck: boolean | undefined = false,
) => {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === SKIP_SESSION_CHECK_KEY) return skipSessionCheck;
      return undefined;
    }),
  };
  const request: any = { headers };
  const context: any = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { reflector, context, request };
};

const createEmployeesService = (overrides: Record<string, ReturnType<typeof vi.fn>> = {}) => ({
  findByKeycloakSub: vi.fn().mockResolvedValue(null),
  findByEmail: vi.fn().mockResolvedValue(null),
  linkKeycloakSub: vi.fn().mockResolvedValue(undefined),
  setActiveSessionId: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("JwtAuthGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows access for routes marked @Public without checking the token", async () => {
    const { reflector, context } = createContext({}, true);
    const guard = new JwtAuthGuard(reflector as any, createEmployeesService() as any);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedException when no Authorization header is present", async () => {
    const { reflector, context } = createContext({}, false);
    const guard = new JwtAuthGuard(reflector as any, createEmployeesService() as any);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when the header doesn't start with 'Bearer '", async () => {
    const { reflector, context } = createContext({ authorization: "Token abc" }, false);
    const guard = new JwtAuthGuard(reflector as any, createEmployeesService() as any);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when token verification fails", async () => {
    verifyMock.mockRejectedValue(new Error("bad signature"));
    const { reflector, context } = createContext({ authorization: "Bearer badtoken" }, false);
    const guard = new JwtAuthGuard(reflector as any, createEmployeesService() as any);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when the token is missing an email claim", async () => {
    verifyMock.mockResolvedValue({ claims: { sub: "sub-1" } });
    const { reflector, context } = createContext({ authorization: "Bearer good" }, false);
    const guard = new JwtAuthGuard(reflector as any, createEmployeesService() as any);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when the user isn't registered in the system", async () => {
    verifyMock.mockResolvedValue({ claims: { sub: "sub-1", email: "a@b.com" } });
    const { reflector, context } = createContext({ authorization: "Bearer good" }, false);
    const guard = new JwtAuthGuard(reflector as any, createEmployeesService() as any);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("resolves an existing employee by keycloak sub and attaches request.employee", async () => {
    verifyMock.mockResolvedValue({
      claims: { sub: "sub-1", email: "a@b.com", realm_access: { roles: [] } },
    });
    const employee = { id: 5, employeeId: "EMP5", email: "a@b.com", role: UserRole.EMPLOYEE, status: "active" };
    const employeesService = createEmployeesService({
      findByKeycloakSub: vi.fn().mockResolvedValue(employee),
    });
    const { reflector, context, request } = createContext({ authorization: "Bearer good" }, false);
    const guard = new JwtAuthGuard(reflector as any, employeesService as any);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.employee).toEqual({
      userId: 5,
      employeeId: "EMP5",
      email: "a@b.com",
      role: UserRole.EMPLOYEE,
      sub: "sub-1",
    });
  });

  it("falls back to matching by email and links the keycloak sub", async () => {
    verifyMock.mockResolvedValue({
      claims: { sub: "sub-2", email: "b@c.com", realm_access: { roles: [] } },
    });
    const employee = { id: 6, employeeId: "EMP6", email: "b@c.com", role: UserRole.HR_MANAGER, status: "active" };
    const employeesService = createEmployeesService({
      findByKeycloakSub: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(employee),
      linkKeycloakSub: vi.fn().mockResolvedValue(undefined),
    });
    const { reflector, context, request } = createContext({ authorization: "Bearer good" }, false);
    const guard = new JwtAuthGuard(reflector as any, employeesService as any);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(employeesService.linkKeycloakSub).toHaveBeenCalledWith(6, "sub-2");
    expect(request.employee.sub).toBe("sub-2");
  });

  it("always trusts the DB row's role over the token's realm roles", async () => {
    verifyMock.mockResolvedValue({
      claims: {
        sub: "sub-3",
        email: "c@d.com",
        realm_access: { roles: [UserRole.SUPER_ADMIN] },
      },
    });
    const employee = { id: 7, employeeId: "EMP7", email: "c@d.com", role: UserRole.EMPLOYEE, status: "active" };
    const employeesService = createEmployeesService({
      findByKeycloakSub: vi.fn().mockResolvedValue(employee),
    });
    const { reflector, context, request } = createContext({ authorization: "Bearer good" }, false);
    const guard = new JwtAuthGuard(reflector as any, employeesService as any);
    await guard.canActivate(context);
    expect(request.employee.role).toBe(UserRole.EMPLOYEE);
  });

  describe("OCD-455 single active session enforcement", () => {
    it("allows the request and attaches sid when the token's sid matches the stored activeSessionId", async () => {
      verifyMock.mockResolvedValue({
        claims: { sub: "sub-4", email: "d@e.com", sid: "session-a", realm_access: { roles: [] } },
      });
      const employee = { id: 8, employeeId: "EMP8", email: "d@e.com", role: UserRole.EMPLOYEE, status: "active", activeSessionId: "session-a" };
      const employeesService = createEmployeesService({
        findByKeycloakSub: vi.fn().mockResolvedValue(employee),
      });
      const { reflector, context, request } = createContext({ authorization: "Bearer good" }, false);
      const guard = new JwtAuthGuard(reflector as any, employeesService as any);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.employee.sid).toBe("session-a");
    });

    it("allows the request when the employee has no stored activeSessionId yet", async () => {
      verifyMock.mockResolvedValue({
        claims: { sub: "sub-5", email: "e@f.com", sid: "session-b", realm_access: { roles: [] } },
      });
      const employee = { id: 9, employeeId: "EMP9", email: "e@f.com", role: UserRole.EMPLOYEE, status: "active", activeSessionId: null };
      const employeesService = createEmployeesService({
        findByKeycloakSub: vi.fn().mockResolvedValue(employee),
      });
      const { reflector, context } = createContext({ authorization: "Bearer good" }, false);
      const guard = new JwtAuthGuard(reflector as any, employeesService as any);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      // The guard only ever checks - it never writes activeSessionId itself
      // (that's POST /auth/claim-session's job), even on first sight.
      expect(employeesService.setActiveSessionId).not.toHaveBeenCalled();
    });

    it("rejects with SESSION_TERMINATED when the token's sid no longer matches the stored activeSessionId", async () => {
      verifyMock.mockResolvedValue({
        claims: { sub: "sub-6", email: "f@g.com", sid: "session-old", realm_access: { roles: [] } },
      });
      const employee = { id: 10, employeeId: "EMP10", email: "f@g.com", role: UserRole.EMPLOYEE, status: "active", activeSessionId: "session-new" };
      const employeesService = createEmployeesService({
        findByKeycloakSub: vi.fn().mockResolvedValue(employee),
      });
      const { reflector, context } = createContext({ authorization: "Bearer good" }, false);
      const guard = new JwtAuthGuard(reflector as any, employeesService as any);
      const rejection = guard.canActivate(context);
      await expect(rejection).rejects.toThrow(UnauthorizedException);
      await rejection.catch((err: any) => {
        expect(err.getResponse()).toMatchObject({ code: "SESSION_TERMINATED" });
      });
    });

    it("never promotes a displaced session back to active just because it made another request", async () => {
      // Same scenario as above, but confirms the guard doesn't call
      // setActiveSessionId as a side effect of the rejection - a stale
      // session's repeated requests must never be able to win control back.
      verifyMock.mockResolvedValue({
        claims: { sub: "sub-7", email: "g@h.com", sid: "session-old", realm_access: { roles: [] } },
      });
      const employee = { id: 11, employeeId: "EMP11", email: "g@h.com", role: UserRole.EMPLOYEE, status: "active", activeSessionId: "session-new" };
      const employeesService = createEmployeesService({
        findByKeycloakSub: vi.fn().mockResolvedValue(employee),
      });
      const { reflector, context } = createContext({ authorization: "Bearer good" }, false);
      const guard = new JwtAuthGuard(reflector as any, employeesService as any);
      await guard.canActivate(context).catch(() => undefined);
      expect(employeesService.setActiveSessionId).not.toHaveBeenCalled();
    });

    it("skips the session check for a handler marked @SkipSessionCheck even on a sid mismatch", async () => {
      verifyMock.mockResolvedValue({
        claims: { sub: "sub-8", email: "h@i.com", sid: "session-fresh", realm_access: { roles: [] } },
      });
      const employee = { id: 12, employeeId: "EMP12", email: "h@i.com", role: UserRole.EMPLOYEE, status: "active", activeSessionId: "session-stale" };
      const employeesService = createEmployeesService({
        findByKeycloakSub: vi.fn().mockResolvedValue(employee),
      });
      const { reflector, context } = createContext({ authorization: "Bearer good" }, false, true);
      const guard = new JwtAuthGuard(reflector as any, employeesService as any);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
