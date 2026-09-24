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
    findEmployeeIdsWithOverlappingLeave: vi.fn(),
    findOverlappingRequestsForEmployee: vi.fn(),
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

const ATTACHMENT_URL = "/uploads/documents/doc.pdf";

describe("leaveService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lcm.getHolidaysInRange.mockResolvedValue([]);
    // Default: requester has no employeeCategory on record (pre-existing
    // employees predate this field) - not that it matters anymore, since a
    // coverup employee is never mandatory (OCD-503).
    em.findByEmployeeId.mockResolvedValue(undefined);
    lm.findEmployeeIdsWithOverlappingLeave.mockResolvedValue(new Set());
    lm.findOverlappingRequestsForEmployee.mockResolvedValue([]);
  });

  describe("listLeaveRequests", () => {
    it("scopes to the caller's own requests when selfOnly is true", async () => {
      lm.findByEmployeeId.mockResolvedValue([{ id: 1 }]);
      const result = await leaveService.listLeaveRequests("EMP1", true, {} as any);
      expect(lm.findByEmployeeId).toHaveBeenCalledWith("EMP1", { status: undefined, year: undefined });
      expect(result).toEqual([{ id: 1 }]);
    });

    it("returns every request when selfOnly is false", async () => {
      lm.getAll.mockResolvedValue([{ id: 2 }]);
      const result = await leaveService.listLeaveRequests("HR1", false, {} as any);
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

    it("throws when no attachment is provided", async () => {
      await expect(leaveService.createLeaveRequest("EMP1", fullDayInput)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(lm.createRequest).not.toHaveBeenCalled();
    });

    it("computes total_days as working days excluding weekends/holidays", async () => {
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10, available_days: 10 }]);
      lm.createRequest.mockResolvedValue({ id: 1 });
      await leaveService.createLeaveRequest("EMP1", fullDayInput, ATTACHMENT_URL);
      expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ total_days: 2 }));
    });

    it("uses 0.5 days for a half-day request", async () => {
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10, available_days: 10 }]);
      lm.createRequest.mockResolvedValue({ id: 1 });
      await leaveService.createLeaveRequest(
        "EMP1",
        { ...fullDayInput, end_date: fullDayInput.start_date, is_half_day: true, half_day_period: "morning" },
        ATTACHMENT_URL,
      );
      expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ total_days: 0.5 }));
    });

    it("excludes weekend-only ranges, yielding an invalid (0-day) range error", async () => {
      await expect(
        leaveService.createLeaveRequest(
          "EMP1",
          { ...fullDayInput, start_date: "2026-08-08", end_date: "2026-08-09" }, // Sat-Sun
          ATTACHMENT_URL,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws when no balance exists for the leave type", async () => {
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 2, remaining_days: 10, available_days: 10 }]);
      await expect(leaveService.createLeaveRequest("EMP1", fullDayInput, ATTACHMENT_URL)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("throws when the available balance is insufficient", async () => {
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10, available_days: 1 }]);
      await expect(leaveService.createLeaveRequest("EMP1", fullDayInput, ATTACHMENT_URL)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("excludes calendar holidays from the working-day count", async () => {
      lcm.getHolidaysInRange.mockResolvedValue([{ date: new Date("2026-08-03T00:00:00.000Z") }]);
      lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10, available_days: 10 }]);
      lm.createRequest.mockResolvedValue({ id: 1 });
      await leaveService.createLeaveRequest("EMP1", fullDayInput, ATTACHMENT_URL);
      expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ total_days: 1 }));
    });

    describe("self-overlap validation", () => {
      beforeEach(() => {
        lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10, available_days: 10 }]);
        lm.createRequest.mockResolvedValue({ id: 1 });
      });

      it("blocks a new request when an existing full-day request overlaps the date", async () => {
        lm.findOverlappingRequestsForEmployee.mockResolvedValue([{ is_half_day: false, half_day_period: null }]);
        await expect(
          leaveService.createLeaveRequest("EMP1", fullDayInput, ATTACHMENT_URL),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(lm.createRequest).not.toHaveBeenCalled();
      });

      it("blocks a new full-day request when a half-day request already exists on that date", async () => {
        lm.findOverlappingRequestsForEmployee.mockResolvedValue([
          { is_half_day: true, half_day_period: "morning" },
        ]);
        await expect(
          leaveService.createLeaveRequest("EMP1", fullDayInput, ATTACHMENT_URL),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it("blocks a new half-day request for the same half-day period", async () => {
        lm.findOverlappingRequestsForEmployee.mockResolvedValue([
          { is_half_day: true, half_day_period: "morning" },
        ]);
        await expect(
          leaveService.createLeaveRequest(
            "EMP1",
            { ...fullDayInput, end_date: fullDayInput.start_date, is_half_day: true, half_day_period: "morning" },
            ATTACHMENT_URL,
          ),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it("allows a new half-day request for the opposite half-day period", async () => {
        lm.findOverlappingRequestsForEmployee.mockResolvedValue([
          { is_half_day: true, half_day_period: "morning" },
        ]);
        await leaveService.createLeaveRequest(
          "EMP1",
          { ...fullDayInput, end_date: fullDayInput.start_date, is_half_day: true, half_day_period: "evening" },
          ATTACHMENT_URL,
        );
        expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ total_days: 0.5 }));
      });
    });

    describe("coverup employee (optional)", () => {
      beforeEach(() => {
        lm.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1, remaining_days: 10, available_days: 10 }]);
      });

      it("does not require a coverup employee, even for an Internal employee", async () => {
        // No coverup_employee_id in the input at all - EmployeeModel.findByEmployeeId
        // is never called for this path, since there's no requester-category
        // gate anymore (OCD-503).
        lm.createRequest.mockResolvedValue({ id: 1 });
        await leaveService.createLeaveRequest("EMP1", fullDayInput, ATTACHMENT_URL);
        expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ coverup_employee_id: undefined }));
      });

      it("rejects selecting yourself as the coverup employee", async () => {
        await expect(
          leaveService.createLeaveRequest(
            "EMP1",
            { ...fullDayInput, coverup_employee_id: "EMP1" },
            ATTACHMENT_URL,
          ),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it("rejects a coverup employee that doesn't exist or isn't active", async () => {
        em.findByEmployeeId.mockResolvedValueOnce(undefined); // coverup lookup
        await expect(
          leaveService.createLeaveRequest(
            "EMP1",
            { ...fullDayInput, coverup_employee_id: "EMP2" },
            ATTACHMENT_URL,
          ),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it("accepts a valid, active coverup employee and passes it through", async () => {
        em.findByEmployeeId.mockResolvedValueOnce({ status: "active" }); // coverup
        lm.createRequest.mockResolvedValue({ id: 1 });
        await leaveService.createLeaveRequest(
          "EMP1",
          { ...fullDayInput, coverup_employee_id: "EMP2" },
          ATTACHMENT_URL,
        );
        expect(lm.findEmployeeIdsWithOverlappingLeave).toHaveBeenCalledWith(
          ["EMP2"],
          fullDayInput.start_date,
          fullDayInput.end_date,
        );
        expect(lm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ coverup_employee_id: "EMP2" }));
      });

      it("rejects a coverup employee who already has leave scheduled during this period", async () => {
        em.findByEmployeeId.mockResolvedValueOnce({ status: "active" }); // coverup
        lm.findEmployeeIdsWithOverlappingLeave.mockResolvedValue(new Set(["EMP2"]));
        await expect(
          leaveService.createLeaveRequest(
            "EMP1",
            { ...fullDayInput, coverup_employee_id: "EMP2" },
            ATTACHMENT_URL,
          ),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(lm.createRequest).not.toHaveBeenCalled();
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

      it("forbids HR Executive from approving (Administrator/HR Manager only)", async () => {
        lm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: LeaveStatus.PENDING });
        await expect(
          leaveService.approveLeaveRequest(1, 9, UserRole.HR_EXECUTIVE, "hr"),
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

    it("forbids HR Executive (Administrator/HR Manager only)", async () => {
      await expect(leaveService.rejectLeaveRequest(1, UserRole.HR_EXECUTIVE, "reason")).rejects.toMatchObject({
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
