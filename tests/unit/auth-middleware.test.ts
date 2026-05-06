import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  authenticate,
  authorize,
  isSuperAdmin,
} from "../../src/middleware/auth";
import { UserRole } from "../../src/types";
import jwt from "jsonwebtoken";

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(),
  },
}));

const jwtMock = jwt as unknown as { verify: ReturnType<typeof vi.fn> };

const createRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticate returns 401 when token is missing", () => {
    const req = { headers: {} };
    const res = createRes();
    const next = vi.fn();

    authenticate(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("authenticate sets req.user when token is valid", () => {
    const req: { headers: { authorization: string }; user?: unknown } = {
      headers: { authorization: "Bearer token" },
    };
    const res = createRes();
    const next = vi.fn();

    jwtMock.verify.mockReturnValue({ id: 1, role: UserRole.EMPLOYEE });
    authenticate(req as never, res as never, next);

    expect(req.user).toEqual({ id: 1, role: UserRole.EMPLOYEE });
    expect(next).toHaveBeenCalled();
  });

  it("authenticate returns 401 on invalid token", () => {
    const req = { headers: { authorization: "Bearer bad" } };
    const res = createRes();
    const next = vi.fn();

    jwtMock.verify.mockImplementation(() => {
      throw new Error("bad token");
    });

    authenticate(req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("authorize returns 401 when user is missing", () => {
    const req = {};
    const res = createRes();
    const next = vi.fn();

    authorize(UserRole.HR_MANAGER)(req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("authorize allows super admin bypass", () => {
    const req = { user: { role: UserRole.SUPER_ADMIN } };
    const res = createRes();
    const next = vi.fn();

    authorize(UserRole.HR_MANAGER)(req as never, res as never, next);
    expect(next).toHaveBeenCalled();
  });

  it("authorize returns 403 for disallowed role", () => {
    const req = { user: { role: UserRole.EMPLOYEE } };
    const res = createRes();
    const next = vi.fn();

    authorize(UserRole.HR_MANAGER)(req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("isSuperAdmin checks role correctly", () => {
    expect(
      isSuperAdmin({ user: { role: UserRole.SUPER_ADMIN } } as never),
    ).toBe(true);
    expect(isSuperAdmin({ user: { role: UserRole.EMPLOYEE } } as never)).toBe(
      false,
    );
  });
});
