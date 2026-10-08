import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConsultantSubmissionStatus, UserRole } from "../../src/types";

vi.mock("../../src/modules/consultant-submissions/ConsultantWorkSubmission", () => ({
  ConsultantWorkSubmissionModel: {
    create: vi.fn(),
    findByEmployeeId: vi.fn(),
    getAll: vi.fn(),
    findById: vi.fn(),
    updateStatusTransactional: vi.fn(),
  },
}));

import { ConsultantWorkSubmissionModel } from "../../src/modules/consultant-submissions/ConsultantWorkSubmission";
import { ConsultantSubmissionsService } from "../../src/modules/consultant-submissions/consultant-submissions.service";
import { ConsultantSubmissionsController } from "../../src/modules/consultant-submissions/consultant-submissions.controller";

const model = ConsultantWorkSubmissionModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

const consultant = { userId: 1, employeeId: "EMP1", role: UserRole.CONSULTANT } as any;
const hr = { userId: 2, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;
const otherConsultant = { userId: 3, employeeId: "EMP3", role: UserRole.CONSULTANT } as any;

describe("ConsultantSubmissionsService", () => {
  const service = new ConsultantSubmissionsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("submit", () => {
    const validDto = { project: "P", tech: "T", total_hours: "5" } as any;
    const file = { filename: "sheet.xlsx" } as any;

    it("rejects non-consultant roles", async () => {
      await expect(service.submit(hr, validDto, file)).rejects.toThrow(ForbiddenException);
    });

    it("rejects when required fields are missing", async () => {
      await expect(service.submit(consultant, { project: "", tech: "T", total_hours: "5" } as any, file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects a non-numeric total_hours", async () => {
      await expect(
        service.submit(consultant, { ...validDto, total_hours: "abc" }, file),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects total_hours <= 0", async () => {
      await expect(service.submit(consultant, { ...validDto, total_hours: "0" }, file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects a missing log sheet file", async () => {
      await expect(service.submit(consultant, validDto, undefined)).rejects.toThrow(BadRequestException);
    });

    it("creates the submission on success", async () => {
      model.create.mockResolvedValue({ id: 1 });
      const result = await service.submit(consultant, validDto, file);
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ employee_id: "EMP1", project: "P", tech: "T", total_hours: 5 }),
      );
      expect(result).toEqual({ success: true, message: "Work submission created", submission: { id: 1 } });
    });
  });

  describe("getSubmissions", () => {
    it("routes HR roles to getAll", async () => {
      model.getAll.mockResolvedValue([{ id: 1 }]);
      const result = await service.getSubmissions(hr, undefined);
      expect(model.getAll).toHaveBeenCalled();
      expect(result).toEqual({ success: true, submissions: [{ id: 1 }] });
    });

    it("routes non-HR roles to their own submissions", async () => {
      model.findByEmployeeId.mockResolvedValue([{ id: 2 }]);
      const result = await service.getSubmissions(consultant, ConsultantSubmissionStatus.PENDING);
      expect(model.findByEmployeeId).toHaveBeenCalledWith("EMP1", { status: ConsultantSubmissionStatus.PENDING });
      expect(result).toEqual({ success: true, submissions: [{ id: 2 }] });
    });

    it("getMySubmissions throws when the employee has no employeeId", async () => {
      await expect(service.getMySubmissions({ ...consultant, employeeId: null }, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("getSubmissionById", () => {
    it("throws NotFoundException when missing", async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.getSubmissionById(hr, 1)).rejects.toThrow(NotFoundException);
    });

    it("forbids a consultant viewing another consultant's submission", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP1" });
      await expect(service.getSubmissionById(otherConsultant, 1)).rejects.toThrow(ForbiddenException);
    });

    it("allows HR to view any submission", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP1" });
      const result = await service.getSubmissionById(hr, 1);
      expect(result).toEqual({ success: true, submission: { id: 1, employee_id: "EMP1" } });
    });

    it("allows the owning consultant to view their own submission", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP1" });
      const result = await service.getSubmissionById(consultant, 1);
      expect(result.submission.employee_id).toBe("EMP1");
    });
  });

  describe("decideSubmission", () => {
    const dto = (overrides: any = {}) => ({ action: "approve", admin_comment: undefined, ...overrides });

    it("rejects non-HR roles", async () => {
      await expect(service.decideSubmission(consultant, 1, dto())).rejects.toThrow(ForbiddenException);
    });

    it("rejects an invalid action", async () => {
      await expect(service.decideSubmission(hr, 1, dto({ action: "delete" }))).rejects.toThrow(BadRequestException);
    });

    it("requires an admin_comment for rejection", async () => {
      await expect(service.decideSubmission(hr, 1, dto({ action: "reject" }))).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException for a missing submission", async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.decideSubmission(hr, 1, dto())).rejects.toThrow(NotFoundException);
    });

    it("approves a pending submission", async () => {
      model.findById.mockResolvedValue({ id: 1 });
      model.updateStatusTransactional.mockResolvedValue({ id: 1, status: ConsultantSubmissionStatus.APPROVED });
      const result = await service.decideSubmission(hr, 1, dto());
      expect(model.updateStatusTransactional).toHaveBeenCalledWith(
        1,
        ConsultantSubmissionStatus.PENDING,
        ConsultantSubmissionStatus.APPROVED,
        hr.userId,
        null,
      );
      expect(result.message).toBe("Submission approved");
    });

    it("rejects a pending submission with a trimmed comment", async () => {
      model.findById.mockResolvedValue({ id: 1 });
      model.updateStatusTransactional.mockResolvedValue({ id: 1, status: ConsultantSubmissionStatus.REJECTED });
      const result = await service.decideSubmission(hr, 1, dto({ action: "reject", admin_comment: "  bad  " }));
      expect(model.updateStatusTransactional).toHaveBeenCalledWith(
        1,
        ConsultantSubmissionStatus.PENDING,
        ConsultantSubmissionStatus.REJECTED,
        hr.userId,
        "bad",
      );
      expect(result.message).toBe("Submission rejected");
    });

    it("maps SUBMISSION_NOT_PENDING to a 400", async () => {
      model.findById.mockResolvedValue({ id: 1 });
      model.updateStatusTransactional.mockRejectedValue(new Error("SUBMISSION_NOT_PENDING"));
      await expect(service.decideSubmission(hr, 1, dto())).rejects.toThrow(BadRequestException);
    });

    it("rethrows unrelated errors", async () => {
      model.findById.mockResolvedValue({ id: 1 });
      model.updateStatusTransactional.mockRejectedValue(new Error("db exploded"));
      await expect(service.decideSubmission(hr, 1, dto())).rejects.toThrow("db exploded");
    });
  });

  describe("resubmit", () => {
    const dto = { project: "New", tech: "New Tech", total_hours: "3" } as any;
    const file = { filename: "sheet2.xlsx" } as any;

    it("rejects non-consultant roles", async () => {
      await expect(service.resubmit(hr, 1, dto, file)).rejects.toThrow(ForbiddenException);
    });

    it("throws NotFoundException when the original submission is missing", async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.resubmit(consultant, 1, dto, file)).rejects.toThrow(NotFoundException);
    });

    it("forbids resubmitting someone else's submission", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP999", status: ConsultantSubmissionStatus.REJECTED });
      await expect(service.resubmit(consultant, 1, dto, file)).rejects.toThrow(ForbiddenException);
    });

    it("only allows resubmitting rejected submissions", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: ConsultantSubmissionStatus.PENDING });
      await expect(service.resubmit(consultant, 1, dto, file)).rejects.toThrow(BadRequestException);
    });

    it("requires a new log sheet file", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: ConsultantSubmissionStatus.REJECTED });
      await expect(service.resubmit(consultant, 1, dto, undefined)).rejects.toThrow(BadRequestException);
    });

    it("creates a resubmission carrying over unset fields", async () => {
      model.findById.mockResolvedValue({
        id: 1,
        employee_id: "EMP1",
        status: ConsultantSubmissionStatus.REJECTED,
        project: "Old",
        tech: "OldTech",
        total_hours: 10,
        comment: "old comment",
      });
      model.create.mockResolvedValue({ id: 2 });
      const result = await service.resubmit(consultant, 1, { total_hours: "3" } as any, file);
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ project: "Old", tech: "OldTech", total_hours: 3, resubmission_of: 1 }),
      );
      expect(result.message).toBe("Work resubmitted");
    });
  });
});

describe("ConsultantSubmissionsController", () => {
  const createServiceMock = () => ({
    getSubmissions: vi.fn(),
    getSubmissionById: vi.fn(),
    submit: vi.fn(),
    decideSubmission: vi.fn(),
    resubmit: vi.fn(),
  });

  let service: ReturnType<typeof createServiceMock>;
  let controller: ConsultantSubmissionsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new ConsultantSubmissionsController(service as any);
  });

  it("getSubmissionById rejects a non-numeric id", () => {
    expect(() => controller.getSubmissionById(consultant, "abc")).toThrow(BadRequestException);
  });

  it("getSubmissionById delegates with a parsed id", () => {
    controller.getSubmissionById(consultant, "5");
    expect(service.getSubmissionById).toHaveBeenCalledWith(consultant, 5);
  });

  it("decideSubmission rejects a non-numeric id", () => {
    expect(() => controller.decideSubmission(hr, "abc", {} as any)).toThrow(BadRequestException);
  });

  it("resubmit rejects a non-numeric id", () => {
    expect(() => controller.resubmit(consultant, "abc", {} as any, undefined)).toThrow(BadRequestException);
  });

  it("submit delegates directly to the service", () => {
    controller.submit(consultant, {} as any, undefined);
    expect(service.submit).toHaveBeenCalledWith(consultant, {}, undefined);
  });
});
