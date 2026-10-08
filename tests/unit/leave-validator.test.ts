import { describe, it, expect } from "vitest";
import {
  createLeaveRequestSchema,
  approveLeaveRequestSchema,
  rejectLeaveRequestSchema,
  listLeaveRequestsQuerySchema,
  leaveBalanceQuerySchema,
  leaveIdParamSchema,
} from "../../src/validators/leave.validator";
import { LeaveStatus } from "../../src/types";

describe("leave.validator", () => {
  describe("createLeaveRequestSchema", () => {
    it("accepts a valid full-day leave request", () => {
      const result = createLeaveRequestSchema.safeParse({
        leave_type_id: "1",
        start_date: "2026-08-01",
        end_date: "2026-08-03",
        reason: "Vacation",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.is_half_day).toBe(false);
    });

    it("accepts a valid half-day leave request", () => {
      const result = createLeaveRequestSchema.safeParse({
        leave_type_id: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-01",
        is_half_day: true,
        half_day_period: "morning",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a half-day request spanning multiple days", () => {
      const result = createLeaveRequestSchema.safeParse({
        leave_type_id: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-02",
        is_half_day: true,
        half_day_period: "morning",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a half-day request missing half_day_period", () => {
      const result = createLeaveRequestSchema.safeParse({
        leave_type_id: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-01",
        is_half_day: "true",
      });
      expect(result.success).toBe(false);
    });

    it("accepts an optional coverup_employee_id", () => {
      const result = createLeaveRequestSchema.safeParse({
        leave_type_id: 1,
        start_date: "2026-08-01",
        end_date: "2026-08-03",
        coverup_employee_id: "EMP2026002",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.coverup_employee_id).toBe("EMP2026002");
    });

    it("rejects a malformed date", () => {
      const result = createLeaveRequestSchema.safeParse({
        leave_type_id: 1,
        start_date: "01-08-2026",
        end_date: "2026-08-01",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("approveLeaveRequestSchema / rejectLeaveRequestSchema", () => {
    it("requires approvedBy to be team_leader or hr", () => {
      expect(approveLeaveRequestSchema.safeParse({ approvedBy: "team_leader" }).success).toBe(true);
      expect(approveLeaveRequestSchema.safeParse({ approvedBy: "manager" }).success).toBe(false);
    });

    it("requires a non-empty rejectionReason", () => {
      expect(rejectLeaveRequestSchema.safeParse({ rejectionReason: "Insufficient balance" }).success).toBe(true);
      expect(rejectLeaveRequestSchema.safeParse({ rejectionReason: "" }).success).toBe(false);
    });
  });

  describe("query schemas", () => {
    it("listLeaveRequestsQuerySchema accepts valid status/year", () => {
      const result = listLeaveRequestsQuerySchema.safeParse({
        status: LeaveStatus.PENDING,
        year: "2026",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.year).toBe(2026);
    });

    it("listLeaveRequestsQuerySchema rejects an out-of-range year", () => {
      expect(listLeaveRequestsQuerySchema.safeParse({ year: "1900" }).success).toBe(false);
    });

    it("leaveBalanceQuerySchema year is optional", () => {
      expect(leaveBalanceQuerySchema.safeParse({}).success).toBe(true);
    });

    it("leaveIdParamSchema coerces and validates id", () => {
      expect(leaveIdParamSchema.safeParse({ id: "5" }).success).toBe(true);
      expect(leaveIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    });
  });
});
