import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/modules/profile-change-requests/profileChangeRequest.service", () => ({
  profileChangeRequestService: {
    submitChangeRequest: vi.fn(),
    listRequests: vi.fn(),
    getRequestById: vi.fn(),
    decide: vi.fn(),
    summarizeChanges: vi.fn().mockReturnValue("summary"),
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn(), getAll: vi.fn(), findByEmployeeId: vi.fn() },
}));
vi.mock("../../src/config/email", () => ({
  sendProfileChangeSubmittedEmail: vi.fn(),
  sendProfileChangeApprovedEmail: vi.fn(),
  sendProfileChangeRejectedEmail: vi.fn(),
  sendProfileChangeReturnedEmail: vi.fn(),
}));
vi.mock("../../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { profileChangeRequestService } from "../../src/modules/profile-change-requests/profileChangeRequest.service";
import { EmployeeModel } from "../../src/employees/Employee";
import {
  sendProfileChangeSubmittedEmail,
  sendProfileChangeApprovedEmail,
  sendProfileChangeRejectedEmail,
  sendProfileChangeReturnedEmail,
} from "../../src/config/email";
import { ProfileChangeRequestsController } from "../../src/modules/profile-change-requests/profile-change-requests.controller";

const pcrs = profileChangeRequestService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const emailMocks = {
  submitted: sendProfileChangeSubmittedEmail as unknown as ReturnType<typeof vi.fn>,
  approved: sendProfileChangeApprovedEmail as unknown as ReturnType<typeof vi.fn>,
  rejected: sendProfileChangeRejectedEmail as unknown as ReturnType<typeof vi.fn>,
  returned: sendProfileChangeReturnedEmail as unknown as ReturnType<typeof vi.fn>,
};

const employee = { userId: 1, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any;
const hr = { userId: 2, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;
const validChanges = {
  changes: [
    {
      entityType: "user_field",
      field: "contactNumber",
      operation: "update",
      before: "+94770000000",
      after: "+94779999999",
    },
  ],
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("ProfileChangeRequestsController", () => {
  let controller: ProfileChangeRequestsController;

  beforeEach(() => {
    vi.clearAllMocks();
    pcrs.summarizeChanges.mockReturnValue("summary");
    controller = new ProfileChangeRequestsController();
  });

  describe("submit", () => {
    it("rejects when the caller has no employeeId", async () => {
      await expect(controller.submit(validChanges, { ...employee, employeeId: null })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("propagates a ZodError for an invalid body", async () => {
      await expect(controller.submit({ changes: [] }, employee)).rejects.toThrow();
    });

    it("submits the request and notifies HR in the background", async () => {
      pcrs.submitChangeRequest.mockResolvedValue({ id: 10 });
      em.findById.mockResolvedValue({ firstName: "Jane", lastName: "Doe" });
      em.getAll.mockResolvedValue([{ email: "hr1@x.com" }, { email: "hr2@x.com" }]);
      emailMocks.submitted.mockResolvedValue(undefined);

      const result = await controller.submit(validChanges, employee);
      expect(pcrs.submitChangeRequest).toHaveBeenCalledWith(1, "EMP1", expect.objectContaining({ changes: expect.any(Array) }));
      expect(result).toEqual({ success: true, message: "Profile change request submitted", data: { id: 10 } });

      await flush();
      expect(emailMocks.submitted).toHaveBeenCalledTimes(2);
      expect(em.getAll).toHaveBeenCalledWith({ role: [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE] });
    });

    it("skips notification when the submitting employee can't be resolved", async () => {
      pcrs.submitChangeRequest.mockResolvedValue({ id: 11 });
      em.findById.mockResolvedValue(null);
      em.getAll.mockResolvedValue([{ email: "hr1@x.com" }]);
      await controller.submit(validChanges, employee);
      await flush();
      expect(emailMocks.submitted).not.toHaveBeenCalled();
    });
  });

  describe("list / getById", () => {
    it("list parses the query and delegates", async () => {
      pcrs.listRequests.mockResolvedValue([{ id: 1 }]);
      const result = await controller.list({}, employee);
      expect(pcrs.listRequests).toHaveBeenCalledWith("EMP1", UserRole.EMPLOYEE, {});
      expect(result.data).toEqual([{ id: 1 }]);
    });

    it("getById parses the id param and delegates", async () => {
      pcrs.getRequestById.mockResolvedValue({ id: 5 });
      const result = await controller.getById({ id: "5" }, employee);
      expect(pcrs.getRequestById).toHaveBeenCalledWith(5, "EMP1", UserRole.EMPLOYEE);
      expect(result.data).toEqual({ id: 5 });
    });

    it("getById propagates a ZodError for a bad id", async () => {
      await expect(controller.getById({ id: "abc" }, employee)).rejects.toThrow();
    });
  });

  describe("decision", () => {
    it("decides and sends an approval email", async () => {
      pcrs.decide.mockResolvedValue({ id: 1, employeeId: "EMP1", changes: [] });
      em.findByEmployeeId.mockResolvedValue({ firstName: "Jane", lastName: "Doe", email: "jane@x.com" });
      emailMocks.approved.mockResolvedValue(undefined);

      const result = await controller.decision({ id: "1" }, { decision: "approved" }, hr);
      expect(pcrs.decide).toHaveBeenCalledWith(1, hr.userId, hr.role, "approved", undefined);
      expect(result.message).toBe("Profile change request updated");

      await flush();
      expect(emailMocks.approved).toHaveBeenCalledWith(
        "jane@x.com",
        expect.objectContaining({ employeeName: "Jane Doe", referenceNumber: "PCR-1" }),
      );
    });

    it("sends a rejection email with reviewer comments", async () => {
      pcrs.decide.mockResolvedValue({ id: 2, employeeId: "EMP1", changes: [] });
      em.findByEmployeeId.mockResolvedValue({ firstName: "A", lastName: "B", email: "a@b.com" });
      emailMocks.rejected.mockResolvedValue(undefined);

      await controller.decision({ id: "2" }, { decision: "rejected", reviewerComments: "Missing docs" }, hr);
      await flush();
      expect(emailMocks.rejected).toHaveBeenCalledWith(
        "a@b.com",
        expect.objectContaining({ reviewerComments: "Missing docs" }),
      );
    });

    it("sends a returned-for-modification email", async () => {
      pcrs.decide.mockResolvedValue({ id: 3, employeeId: "EMP1", changes: [] });
      em.findByEmployeeId.mockResolvedValue({ firstName: "A", lastName: "B", email: "a@b.com" });
      emailMocks.returned.mockResolvedValue(undefined);

      await controller.decision(
        { id: "3" },
        { decision: "returned_for_modification", reviewerComments: "Please fix" },
        hr,
      );
      await flush();
      expect(emailMocks.returned).toHaveBeenCalled();
    });

    it("skips the notification when the employee can't be resolved", async () => {
      pcrs.decide.mockResolvedValue({ id: 4, employeeId: "EMP1", changes: [] });
      em.findByEmployeeId.mockResolvedValue(null);
      await controller.decision({ id: "4" }, { decision: "approved" }, hr);
      await flush();
      expect(emailMocks.approved).not.toHaveBeenCalled();
    });

    it("propagates a ZodError for an invalid decision", async () => {
      await expect(controller.decision({ id: "1" }, { decision: "not_a_decision" }, hr)).rejects.toThrow();
    });
  });
});
