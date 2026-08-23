import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeaveStatus, UserRole } from "../../src/types";

vi.mock("../../src/modules/leaves/Leave", () => ({
  LeaveModel: {
    getLeaveTypes: vi.fn(),
    getLeaveBalance: vi.fn(),
    findByEmployeeId: vi.fn(),
    getAll: vi.fn(),
    findById: vi.fn(),
    createRequest: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock("../../src/modules/leave-calendar/LeaveCalendar", () => ({
  LeaveCalendarModel: { getHolidaysInRange: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByEmployeeId: vi.fn() },
}));
vi.mock("../../src/config/database", () => ({
  default: { query: vi.fn() },
}));

import { LeaveModel } from "../../src/modules/leaves/Leave";
import { LeaveCalendarModel } from "../../src/modules/leave-calendar/LeaveCalendar";
import { EmployeeModel } from "../../src/employees/Employee";
import pool from "../../src/config/database";
import { leaveService } from "../../src/modules/leaves/leave.service";

const lm = LeaveModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const lcm = LeaveCalendarModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const poolQueryMock = (pool as any).query as ReturnType<typeof vi.fn>;

describe("leaveService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lcm.getHolidaysInRange.mockResolvedValue([]);
    // Default: requester has no employeeCategory on record (pre-existing
    // employees predate this field) - matches "not Internal", so the
    // coverup requirement doesn't kick in unless a test opts in below.
    em.findByEmployeeId.mockResolvedValue(undefined);
  });

  describe("listLeaveRequests", () => {
    it("scopes employee role to their own requests", async () => {
      lm.findByEmployeeId.mockResolvedValue([{ id: 1 }]);
      const result = await leaveService.listLeaveRequests("EMP1", UserRole.EMPLOYEE, {} as any);
      expect(lm.findByEmployeeId).toHaveBeenCalledWith("EMP1", { status: undefined, year: undefined });
      expect(result).toEqual([{ id: 1 }]);
    });

    it("returns all requests for HR roles", async () => {
      lm.getAll.mockResolvedValue([{ id: 2 }]);
      const result = await leaveService.listLeaveRequests("HR1", UserRole.HR_MANAGER, {} as any);
      expect(lm.getAll).toHaveBeenCalled();
      expect(result).toEqual([{ id: 2 }]);
    });
  });

  describe("getLeaveRequestById", () => {
    it("throws a 404 AppError when missing", async () => {
      lm.findById.mockResolvedValue(null);
      await expect(leaveService.getLeaveRequestById(1, "EMP1", UserRole.EMPLOYEE)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("forbids an employee from viewing someone else's request", async () => {
      lm.findById.mockResolvedValue({ id: 1, employee_id: "OTHER" });
      await expect(leaveService.getLeaveRequestById(1, "EMP1", UserRole.EMPLOYEE)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("allows an employee to view their own request", async () => {
      lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1" });
      const result = await leaveService.getLeaveRequestById(1, "EMP1", UserRole.EMPLOYEE);
      expect(result).toEqual({ id: 1, employee_id: "EMP1" });
    });
  });

  describe("createLeaveRequest", () => {
    const fullDayInput = {
      leave_type_id: 1,
      start_date: "2026-08-03", // Monday
      end_date: "2026-08-04", // Tuesday
      is_half_day: false,
    } as any;

    it("computes total_days as working days excluding weekends/holidays", async () => {
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10 }]);
      lm.createRequest.mockResolvedValue({ id: 1 });
      await leaveService.createLeaveRequest("EMP1", fullDayInput);
      expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ total_days: 2 }));
    });

    it("uses 0.5 days for a half-day request", async () => {
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10 }]);
      lm.createRequest.mockResolvedValue({ id: 1 });
      await leaveService.createLeaveRequest("EMP1", {
        ...fullDayInput,
        end_date: fullDayInput.start_date,
        is_half_day: true,
      });
      expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ total_days: 0.5 }));
    });

    it("excludes weekend-only ranges, yielding an invalid (0-day) range error", async () => {
      await expect(
        leaveService.createLeaveRequest("EMP1", {
          ...fullDayInput,
          start_date: "2026-08-08", // Saturday
          end_date: "2026-08-09", // Sunday
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws when no balance exists for the leave type", async () => {
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 2, remaining_days: 10 }]);
      await expect(leaveService.createLeaveRequest("EMP1", fullDayInput)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws when the balance is insufficient", async () => {
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 1 }]);
      await expect(leaveService.createLeaveRequest("EMP1", fullDayInput)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("excludes calendar holidays from the working-day count", async () => {
      lcm.getHolidaysInRange.mockResolvedValue([{ date: new Date("2026-08-03T00:00:00.000Z") }]);
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10 }]);
      lm.createRequest.mockResolvedValue({ id: 1 });
      await leaveService.createLeaveRequest("EMP1", fullDayInput);
      expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ total_days: 1 }));
    });

    describe("coverup employee requirement (Internal employees only)", () => {
      beforeEach(() => {
        lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10 }]);
      });

      it("requires a coverup employee when the requester is Internal", async () => {
        em.findByEmployeeId.mockResolvedValueOnce({ employeeCategory: "internal" });
        await expect(leaveService.createLeaveRequest("EMP1", fullDayInput)).rejects.toMatchObject({
          statusCode: 400,
        });
        expect(lm.createRequest).not.toHaveBeenCalled();
      });

      it("rejects selecting yourself as the coverup employee", async () => {
        em.findByEmployeeId.mockResolvedValueOnce({ employeeCategory: "internal" });
        await expect(
          leaveService.createLeaveRequest("EMP1", { ...fullDayInput, coverup_employee_id: "EMP1" }),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it("rejects a coverup employee that doesn't exist or isn't active", async () => {
        em.findByEmployeeId.mockResolvedValueOnce({ employeeCategory: "internal" }); // requester
        em.findByEmployeeId.mockResolvedValueOnce(undefined); // coverup lookup
        await expect(
          leaveService.createLeaveRequest("EMP1", { ...fullDayInput, coverup_employee_id: "EMP2" }),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it("accepts a valid, active coverup employee and passes it through", async () => {
        em.findByEmployeeId.mockResolvedValueOnce({ employeeCategory: "internal" }); // requester
        em.findByEmployeeId.mockResolvedValueOnce({ status: "active" }); // coverup
        lm.createRequest.mockResolvedValue({ id: 1 });
        await leaveService.createLeaveRequest("EMP1", { ...fullDayInput, coverup_employee_id: "EMP2" });
        expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ coverup_employee_id: "EMP2" }));
      });

      it("doesn't require a coverup employee for a Client Side requester", async () => {
        em.findByEmployeeId.mockResolvedValueOnce({ employeeCategory: "client_side" });
        lm.createRequest.mockResolvedValue({ id: 1 });
        await leaveService.createLeaveRequest("EMP1", fullDayInput);
        expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ coverup_employee_id: undefined }));
      });
    });
  });

  describe("approveLeaveRequest", () => {
    it("throws a 404 AppError when the request doesn't exist", async () => {
      lm.findById.mockResolvedValue(null);
      await expect(
        leaveService.approveLeaveRequest(1, 9, UserRole.HR_MANAGER, "hr"),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    describe("team_leader approval", () => {
      it("forbids a non-manager from approving", async () => {
        lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: LeaveStatus.PENDING });
        poolQueryMock.mockResolvedValue({ rows: [{ manager_id: 99 }] });
        await expect(
          leaveService.approveLeaveRequest(1, 9, UserRole.HR_MANAGER, "team_leader"),
        ).rejects.toMatchObject({ statusCode: 403 });
      });

      it("rejects approving a request that isn't pending", async () => {
        lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: LeaveStatus.HR_APPROVED });
        poolQueryMock.mockResolvedValue({ rows: [{ manager_id: 9 }] });
        await expect(
          leaveService.approveLeaveRequest(1, 9, UserRole.EMPLOYEE, "team_leader"),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it("approves as team leader when manager_id matches", async () => {
        lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: LeaveStatus.PENDING });
        poolQueryMock.mockResolvedValue({ rows: [{ manager_id: 9 }] });
        lm.updateStatus.mockResolvedValue({ id: 1, status: LeaveStatus.TEAM_LEADER_APPROVED });
        const result = await leaveService.approveLeaveRequest(1, 9, UserRole.EMPLOYEE, "team_leader");
        expect(lm.updateStatus).toHaveBeenCalledWith(1, LeaveStatus.TEAM_LEADER_APPROVED, "team_leader", undefined);
        expect(result.status).toBe(LeaveStatus.TEAM_LEADER_APPROVED);
      });
    });

    describe("hr approval", () => {
      it("forbids a non-HR role from approving", async () => {
        lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: LeaveStatus.PENDING });
        await expect(
          leaveService.approveLeaveRequest(1, 9, UserRole.EMPLOYEE, "hr"),
        ).rejects.toMatchObject({ statusCode: 403 });
      });

      it("rejects an invalid status for HR approval", async () => {
        lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: LeaveStatus.REJECTED });
        await expect(
          leaveService.approveLeaveRequest(1, 9, UserRole.HR_MANAGER, "hr"),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it("approves from pending or team_leader_approved", async () => {
        lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: LeaveStatus.TEAM_LEADER_APPROVED });
        lm.updateStatus.mockResolvedValue({ id: 1, status: LeaveStatus.HR_APPROVED });
        const result = await leaveService.approveLeaveRequest(1, 9, UserRole.HR_MANAGER, "hr");
        expect(result.status).toBe(LeaveStatus.HR_APPROVED);
      });
    });

    it("throws a 404 AppError when the update returns nothing", async () => {
      lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: LeaveStatus.PENDING });
      lm.updateStatus.mockResolvedValue(null);
      await expect(
        leaveService.approveLeaveRequest(1, 9, UserRole.HR_MANAGER, "hr"),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("rejectLeaveRequest", () => {
    it("forbids non-HR roles", async () => {
      await expect(leaveService.rejectLeaveRequest(1, UserRole.EMPLOYEE, "reason")).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("throws a 404 AppError when missing", async () => {
      lm.findById.mockResolvedValue(null);
      await expect(leaveService.rejectLeaveRequest(1, UserRole.HR_MANAGER, "reason")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rejects the request", async () => {
      lm.findById.mockResolvedValue({ id: 1 });
      lm.updateStatus.mockResolvedValue({ id: 1, status: LeaveStatus.REJECTED });
      const result = await leaveService.rejectLeaveRequest(1, UserRole.HR_MANAGER, "reason");
      expect(lm.updateStatus).toHaveBeenCalledWith(1, LeaveStatus.REJECTED, "hr", "reason");
      expect(result.status).toBe(LeaveStatus.REJECTED);
    });
  });
});
