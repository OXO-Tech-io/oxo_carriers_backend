import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

vi.mock("../../src/modules/attendance/AttendanceSession", () => ({
  AttendanceSessionModel: {
    findActive: vi.fn(),
    create: vi.fn(),
    endActive: vi.fn(),
    closeStale: vi.fn(),
    findInRange: vi.fn(),
    findAllInRange: vi.fn(),
  },
}));
vi.mock("../../src/modules/attendance/BreakLog", () => ({
  BreakLogModel: {
    findOpen: vi.fn(),
    start: vi.fn(),
    endOpen: vi.fn(),
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByEmployeeIds: vi.fn(), findByEmployeeId: vi.fn() },
}));

import { AttendanceSessionModel } from "../../src/modules/attendance/AttendanceSession";
import { BreakLogModel } from "../../src/modules/attendance/BreakLog";
import { AttendanceService } from "../../src/modules/attendance/attendance.service";
import type { AttendanceGateway } from "../../src/modules/attendance/attendance.gateway";

const sessionModel = AttendanceSessionModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const breakLogModel = BreakLogModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("AttendanceService (core)", () => {
  // Push-to-device is exercised separately (see attendance.gateway); a stub
  // here is enough to keep pushEvent's fire-and-forget call from being a no-op
  // that would silently mask a real error via its own try/catch.
  const gateway = { pushToDevice: vi.fn() } as unknown as AttendanceGateway;
  const service = new AttendanceService(gateway);

  beforeEach(() => {
    vi.clearAllMocks();
    breakLogModel.endOpen.mockResolvedValue(null);
  });

  it("clockIn creates a session when none is active", async () => {
    sessionModel.findActive.mockResolvedValue(null);
    sessionModel.create.mockResolvedValue({ id: 1 });

    const result = await service.clockIn("EMP1");

    expect(sessionModel.create).toHaveBeenCalledWith("EMP1");
    expect(sessionModel.closeStale).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 1 });
  });

  it("clockIn rejects with a conflict when already clocked in today", async () => {
    sessionModel.findActive.mockResolvedValue({ id: 1, loginAt: new Date() });

    await expect(service.clockIn("EMP1")).rejects.toThrow(ConflictException);
    expect(sessionModel.create).not.toHaveBeenCalled();
    expect(sessionModel.closeStale).not.toHaveBeenCalled();
  });

  it("clockIn auto-closes a session left open from a previous day, then starts a new one", async () => {
    const staleLoginAt = new Date();
    staleLoginAt.setDate(staleLoginAt.getDate() - 1);
    staleLoginAt.setHours(9, 0, 0, 0);
    const stale = { id: 1, loginAt: staleLoginAt };

    sessionModel.findActive.mockResolvedValue(stale);
    sessionModel.closeStale.mockResolvedValue({ ...stale, status: "ended" });
    sessionModel.create.mockResolvedValue({ id: 2 });

    const result = await service.clockIn("EMP1");

    expect(sessionModel.closeStale).toHaveBeenCalledTimes(1);
    const [closedSession, endOfDay] = sessionModel.closeStale.mock.calls[0];
    expect(closedSession).toBe(stale);
    // The stale session should be backdated to 23:59:59.999 on its own day,
    // not "now" - it shouldn't accrue any time past the day it was left open.
    expect(endOfDay.getDate()).toBe(staleLoginAt.getDate());
    expect(endOfDay.getHours()).toBe(23);
    expect(endOfDay.getMinutes()).toBe(59);
    expect(endOfDay.getSeconds()).toBe(59);
    expect(endOfDay.getMilliseconds()).toBe(999);

    expect(sessionModel.create).toHaveBeenCalledWith("EMP1");
    expect(result).toEqual({ id: 2 });
  });

  it("clockIn treats a session with no loginAt as already clocked in (defensive)", async () => {
    sessionModel.findActive.mockResolvedValue({ id: 1, loginAt: null });

    await expect(service.clockIn("EMP1")).rejects.toThrow(ConflictException);
    expect(sessionModel.closeStale).not.toHaveBeenCalled();
  });

  it("clockOut ends the active session", async () => {
    sessionModel.endActive.mockResolvedValue({ id: 1, status: "ended" });

    const result = await service.clockOut("EMP1");

    expect(result).toEqual({ id: 1, status: "ended" });
  });

  it("clockOut throws NotFoundException when nothing is active", async () => {
    sessionModel.endActive.mockResolvedValue(null);

    await expect(service.clockOut("EMP1")).rejects.toThrow(NotFoundException);
  });

  it("clockOut closes a still-open break before ending the session", async () => {
    sessionModel.endActive.mockResolvedValue({ id: 1, status: "ended" });
    breakLogModel.endOpen.mockResolvedValue({ id: 9, breakEnd: new Date() });

    await service.clockOut("EMP1");

    expect(breakLogModel.endOpen).toHaveBeenCalledWith("EMP1");
  });

  it("startBreak requires an active session", async () => {
    sessionModel.findActive.mockResolvedValue(null);

    await expect(service.startBreak("EMP1")).rejects.toThrow(BadRequestException);
    expect(breakLogModel.start).not.toHaveBeenCalled();
  });

  it("startBreak rejects when a break is already open", async () => {
    sessionModel.findActive.mockResolvedValue({ id: 1 });
    breakLogModel.findOpen.mockResolvedValue({ id: 5, breakEnd: null });

    await expect(service.startBreak("EMP1")).rejects.toThrow(ConflictException);
    expect(breakLogModel.start).not.toHaveBeenCalled();
  });

  it("startBreak opens a break against the active session", async () => {
    sessionModel.findActive.mockResolvedValue({ id: 1 });
    breakLogModel.findOpen.mockResolvedValue(null);
    breakLogModel.start.mockResolvedValue({ id: 5, sessionId: 1 });

    const result = await service.startBreak("EMP1");

    expect(breakLogModel.start).toHaveBeenCalledWith("EMP1", 1);
    expect(result).toEqual({ id: 5, sessionId: 1 });
  });

  it("endBreak throws NotFoundException when no break is open", async () => {
    breakLogModel.endOpen.mockResolvedValue(null);

    await expect(service.endBreak("EMP1")).rejects.toThrow(NotFoundException);
  });

  it("endBreak closes the open break", async () => {
    breakLogModel.endOpen.mockResolvedValue({ id: 5, durationSec: 120 });

    const result = await service.endBreak("EMP1");

    expect(result).toEqual({ id: 5, durationSec: 120 });
  });
});
