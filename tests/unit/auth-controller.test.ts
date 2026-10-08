import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { UserRole } from "../../src/types";
import { AuthController } from "../../src/modules/auth/auth.controller";

describe("AuthController", () => {
  const findByIdMock = vi.fn();
  const setActiveSessionIdMock = vi.fn();
  const employeesService = { findById: findByIdMock, setActiveSessionId: setActiveSessionIdMock } as any;
  const controller = new AuthController(employeesService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundException when the current employee no longer exists", async () => {
    findByIdMock.mockResolvedValue(null);
    await expect(
      controller.getMe({ userId: 1, role: UserRole.EMPLOYEE } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns the current user's profile", async () => {
    findByIdMock.mockResolvedValue({ id: 1, email: "a@b.com" });
    const result = await controller.getMe({ userId: 1, role: UserRole.EMPLOYEE } as any);
    expect(result).toEqual({ success: true, message: "Current user", data: { id: 1, email: "a@b.com" } });
    expect(findByIdMock).toHaveBeenCalledWith(1);
  });

  describe("claimSession (OCD-455)", () => {
    it("records the token's sid as the employee's active session", async () => {
      setActiveSessionIdMock.mockResolvedValue(undefined);
      const result = await controller.claimSession({ userId: 1, role: UserRole.EMPLOYEE, sid: "session-xyz" } as any);
      expect(setActiveSessionIdMock).toHaveBeenCalledWith(1, "session-xyz");
      expect(result).toEqual({ success: true, message: "Session claimed" });
    });

    it("no-ops without error when the token carries no sid claim", async () => {
      const result = await controller.claimSession({ userId: 1, role: UserRole.EMPLOYEE } as any);
      expect(setActiveSessionIdMock).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: "Session claimed" });
    });
  });
});
