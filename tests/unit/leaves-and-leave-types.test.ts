import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/modules/leaves/leave.service", () => ({
  leaveService: {
    getLeaveTypes: vi.fn(),
    getLeaveBalance: vi.fn(),
    listLeaveRequests: vi.fn(),
    getLeaveRequestById: vi.fn(),
    createLeaveRequest: vi.fn(),
    approveLeaveRequest: vi.fn(),
    rejectLeaveRequest: vi.fn(),
  },
}));
vi.mock("../../src/config/email", () => ({
  sendLeaveApprovedEmail: vi.fn(),
  sendLeaveRejectedEmail: vi.fn(),
  sendLeaveSubmittedEmail: vi.fn(),
}));
vi.mock("../../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { leaveService } from "../../src/modules/leaves/leave.service";
import {
  sendLeaveApprovedEmail,
  sendLeaveRejectedEmail,
  sendLeaveSubmittedEmail,
} from "../../src/config/email";
import { LeavesService } from "../../src/modules/leaves/leaves.service";
import { LeavesController } from "../../src/modules/leaves/leaves.controller";
import { LeaveTypesService } from "../../src/modules/leave-types/leave-types.service";
import { LeaveTypesController } from "../../src/modules/leave-types/leave-types.controller";

const ls = leaveService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const emailMocks = {
  approved: sendLeaveApprovedEmail as unknown as ReturnType<typeof vi.fn>,
  rejected: sendLeaveRejectedEmail as unknown as ReturnType<typeof vi.fn>,
  submitted: sendLeaveSubmittedEmail as unknown as ReturnType<typeof vi.fn>,
};

const employee = { userId: 1, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any;
const hr = { userId: 2, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("LeaveTypesService / LeaveTypesController", () => {
  it("LeaveTypesService delegates to leaveService.getLeaveTypes", async () => {
    ls.getLeaveTypes.mockResolvedValue([{ id: 1 }]);
    const service = new LeaveTypesService();
    expect(await service.getLeaveTypes()).toEqual([{ id: 1 }]);
  });

  it("LeaveTypesController wraps a success envelope", async () => {
    const serviceMock = { getLeaveTypes: vi.fn().mockResolvedValue([{ id: 1 }]) };
    const controller = new LeaveTypesController(serviceMock as any);
    const result = await controller.getLeaveTypes();
    expect(result).toEqual({ success: true, message: "Leave types fetched", data: [{ id: 1 }] });
  });
});

describe("LeavesService", () => {
  const service = new LeavesService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getLeaveBalance forbids a self-only role querying another employee", async () => {
    await expect(service.getLeaveBalance(employee, "EMP2", {} as any)).rejects.toThrow(ForbiddenException);
  });

  it("getLeaveBalance allows querying your own balance", async () => {
    ls.getLeaveBalance.mockResolvedValue([{ leave_type_id: 1 }]);
    const result = await service.getLeaveBalance(employee, "EMP1", {} as any);
    expect(result).toEqual([{ leave_type_id: 1 }]);
  });

  it("listLeaveRequests requires an employeeId", async () => {
    await expect(
      service.listLeaveRequests({ ...employee, employeeId: null }, {} as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("createLeaveRequest parses the body and forwards the attachment url", async () => {
    ls.createLeaveRequest.mockResolvedValue({ id: 1 });
    await service.createLeaveRequest(
      employee,
      { leave_type_id: 1, start_date: "2026-08-03", end_date: "2026-08-04" },
      { filename: "doc.pdf" } as any,
    );
    expect(ls.createLeaveRequest).toHaveBeenCalledWith(
      "EMP1",
      expect.objectContaining({ leave_type_id: 1 }),
      "/uploads/documents/doc.pdf",
    );
  });

  it("createLeaveRequest propagates a ZodError for an invalid body", async () => {
    await expect(service.createLeaveRequest(employee, {}, undefined)).rejects.toThrow();
  });

  it("approveLeaveRequest forwards actor info and dto fields", async () => {
    ls.approveLeaveRequest.mockResolvedValue({ id: 1 });
    await service.approveLeaveRequest(hr, 1, { approvedBy: "hr", rejectionReason: undefined } as any);
    expect(ls.approveLeaveRequest).toHaveBeenCalledWith(1, hr.userId, hr.role, "hr", undefined);
  });

  it("rejectLeaveRequest forwards the role and reason", async () => {
    ls.rejectLeaveRequest.mockResolvedValue({ id: 1 });
    await service.rejectLeaveRequest(hr, 1, { rejectionReason: "no balance" } as any);
    expect(ls.rejectLeaveRequest).toHaveBeenCalledWith(1, hr.role, "no balance");
  });
});

describe("LeavesController", () => {
  const createServiceMock = () => ({
    getLeaveBalance: vi.fn(),
    listLeaveRequests: vi.fn(),
    getLeaveRequestById: vi.fn(),
    createLeaveRequest: vi.fn(),
    approveLeaveRequest: vi.fn(),
    rejectLeaveRequest: vi.fn(),
  });

  let service: ReturnType<typeof createServiceMock>;
  let controller: LeavesController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createServiceMock();
    controller = new LeavesController(service as any);
  });

  it("getLeaveRequestById rejects a non-numeric id", async () => {
    await expect(controller.getLeaveRequestById(employee, "abc")).rejects.toThrow(BadRequestException);
  });

  it("createLeaveRequest sends a submission email when the employee has an email", async () => {
    const created = {
      id: 5,
      user: { first_name: "Jane", last_name: "Doe", email: "jane@x.com" },
      leave_type: { name: "Annual" },
      start_date: "2026-08-01",
      end_date: "2026-08-02",
      total_days: 2,
      reason: "Trip",
    };
    service.createLeaveRequest.mockResolvedValue(created);
    emailMocks.submitted.mockResolvedValue(undefined);

    const result = await controller.createLeaveRequest(employee, {}, undefined);
    expect(result.data).toEqual(created);
    await flush();
    expect(emailMocks.submitted).toHaveBeenCalledWith(
      "jane@x.com",
      expect.objectContaining({ employeeName: "Jane Doe", referenceNumber: "LV-5" }),
    );
  });

  it("createLeaveRequest doesn't blow up when the employee has no email", async () => {
    service.createLeaveRequest.mockResolvedValue({ id: 6, user: null, start_date: "2026-08-01", end_date: "2026-08-02", total_days: 1 });
    const result = await controller.createLeaveRequest(employee, {}, undefined);
    await flush();
    expect(result.message).toBe("Leave request created");
    expect(emailMocks.submitted).not.toHaveBeenCalled();
  });

  it("createLeaveRequest logs (doesn't throw) when the confirmation email fails", async () => {
    service.createLeaveRequest.mockResolvedValue({
      id: 7,
      user: { first_name: "A", last_name: "B", email: "a@b.com" },
      start_date: "2026-08-01",
      end_date: "2026-08-02",
      total_days: 1,
    });
    emailMocks.submitted.mockRejectedValue(new Error("smtp down"));
    await expect(controller.createLeaveRequest(employee, {}, undefined)).resolves.toBeDefined();
    await flush();
  });

  it("approveLeaveRequest fires the approval email in the background", async () => {
    service.approveLeaveRequest.mockResolvedValue({
      id: 8,
      user: { first_name: "A", last_name: "B", email: "a@b.com" },
      leave_type: { name: "Annual" },
      start_date: "2026-08-01",
      end_date: "2026-08-02",
      total_days: 1,
    });
    emailMocks.approved.mockResolvedValue(undefined);
    await controller.approveLeaveRequest(hr, "8", { approvedBy: "hr" } as any);
    await flush();
    expect(emailMocks.approved).toHaveBeenCalledWith(
      "a@b.com",
      expect.objectContaining({ approvedBy: "HR Management", referenceNumber: "LV-8" }),
    );
  });

  it("rejectLeaveRequest fires the rejection email in the background", async () => {
    service.rejectLeaveRequest.mockResolvedValue({
      id: 9,
      user: { first_name: "A", last_name: "B", email: "a@b.com" },
      start_date: "2026-08-01",
      end_date: "2026-08-02",
      total_days: 1,
    });
    emailMocks.rejected.mockResolvedValue(undefined);
    await controller.rejectLeaveRequest(hr, "9", { rejectionReason: "policy" } as any);
    await flush();
    expect(emailMocks.rejected).toHaveBeenCalledWith(
      "a@b.com",
      expect.objectContaining({ rejectionReason: "policy", referenceNumber: "LV-9" }),
    );
  });
});
