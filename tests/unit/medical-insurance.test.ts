import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MedicalClaimStatus, MedicalClaimType, UserRole } from "../../src/types";

vi.mock("../../src/modules/medical-insurance/MedicalInsurance", () => ({
  MedicalInsuranceModel: {
    getUsedOPDAmountForQuarter: vi.fn(),
    create: vi.fn(),
    findByEmployeeId: vi.fn(),
    getAll: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
  },
  getCurrentQuarter: vi.fn().mockReturnValue("2026-Q3"),
  getMaxAmountForType: vi.fn((type: string) => (type === "IN" ? 300000 : 6000)),
}));
vi.mock("../../src/config/email", () => ({
  sendMedicalClaimApprovedEmail: vi.fn(),
  sendMedicalClaimRejectedEmail: vi.fn(),
  sendMedicalClaimSubmittedEmail: vi.fn(),
}));
vi.mock("../../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { MedicalInsuranceModel } from "../../src/modules/medical-insurance/MedicalInsurance";
import { sendMedicalClaimSubmittedEmail } from "../../src/config/email";
import { MedicalInsuranceService } from "../../src/modules/medical-insurance/medical-insurance.service";
import { MedicalInsuranceController } from "../../src/modules/medical-insurance/medical-insurance.controller";

const model = MedicalInsuranceModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const submittedEmailMock = sendMedicalClaimSubmittedEmail as unknown as ReturnType<typeof vi.fn>;

const employee = { userId: 1, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any;
const hr = { userId: 2, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("MedicalInsuranceService", () => {
  const service = new MedicalInsuranceService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("apply", () => {
    const files = { supportive_document: [{ filename: "doc.pdf" }] } as any;

    it("requires an employeeId", async () => {
      await expect(
        service.apply({ ...employee, employeeId: null }, { type: "IN", amount: "100" } as any, files),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an invalid claim type", async () => {
      await expect(service.apply(employee, { type: "X", amount: "100" } as any, files)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects an invalid amount", async () => {
      await expect(service.apply(employee, { type: "IN", amount: "abc" } as any, files)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects an amount above the type's max", async () => {
      await expect(service.apply(employee, { type: "IN", amount: "400000" } as any, files)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects OPD claims that would exceed the quarterly limit", async () => {
      model.getUsedOPDAmountForQuarter.mockResolvedValue(5000);
      await expect(
        service.apply(employee, { type: "OPD", amount: "2000", quarter: "2026-Q3" } as any, files),
      ).rejects.toThrow(BadRequestException);
    });

    it("requires a supportive document", async () => {
      await expect(service.apply(employee, { type: "IN", amount: "100" } as any, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("creates the claim and fires a confirmation email", async () => {
      model.create.mockResolvedValue({ id: 1, type: "IN", amount: 100, user: { first_name: "A", last_name: "B", email: "a@b.com" } });
      submittedEmailMock.mockResolvedValue(undefined);
      const result = await service.apply(employee, { type: "IN", amount: "100" } as any, files);
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ employee_id: "EMP1", type: "IN", amount: 100 }),
      );
      expect(result.message).toBe("Medical insurance claim submitted");
      await flush();
      expect(submittedEmailMock).toHaveBeenCalled();
    });
  });

  describe("getClaims", () => {
    it("routes HR to getAll", async () => {
      model.getAll.mockResolvedValue([{ id: 1 }]);
      const result = await service.getClaims(hr);
      expect(model.getAll).toHaveBeenCalled();
      expect(result.claims).toEqual([{ id: 1 }]);
    });

    it("routes employees to their own claims", async () => {
      model.findByEmployeeId.mockResolvedValue([{ id: 2 }]);
      const result = await service.getClaims(employee);
      expect(model.findByEmployeeId).toHaveBeenCalledWith("EMP1", { status: undefined });
      expect(result.claims).toEqual([{ id: 2 }]);
    });
  });

  describe("getClaimById", () => {
    it("throws NotFoundException when missing", async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.getClaimById(employee, 1)).rejects.toThrow(NotFoundException);
    });

    it("forbids an employee viewing another's claim", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "OTHER" });
      await expect(service.getClaimById(employee, 1)).rejects.toThrow(ForbiddenException);
    });

    it("allows HR to view any claim", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "OTHER" });
      const result = await service.getClaimById(hr, 1);
      expect(result.claim.id).toBe(1);
    });
  });

  describe("decideClaim", () => {
    const dto = (overrides: any = {}) => ({ action: "approve", ...overrides });

    it("forbids non-HR roles", async () => {
      await expect(service.decideClaim(employee, 1, dto())).rejects.toThrow(ForbiddenException);
    });

    it("rejects an invalid action", async () => {
      await expect(service.decideClaim(hr, 1, dto({ action: "delete" }))).rejects.toThrow(BadRequestException);
    });

    it("requires admin_comment for rejection", async () => {
      await expect(service.decideClaim(hr, 1, dto({ action: "reject" }))).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException for a missing claim", async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.decideClaim(hr, 1, dto())).rejects.toThrow(NotFoundException);
    });

    it("rejects deciding a non-pending claim", async () => {
      model.findById.mockResolvedValue({ id: 1, status: MedicalClaimStatus.APPROVED });
      await expect(service.decideClaim(hr, 1, dto())).rejects.toThrow(BadRequestException);
    });

    it("approves a pending claim", async () => {
      model.findById.mockResolvedValue({ id: 1, status: MedicalClaimStatus.PENDING });
      model.updateStatus.mockResolvedValue({ id: 1, status: MedicalClaimStatus.APPROVED });
      const result = await service.decideClaim(hr, 1, dto());
      expect(model.updateStatus).toHaveBeenCalledWith(1, MedicalClaimStatus.APPROVED, hr.userId, null);
      expect(result.message).toBe("Claim approved");
    });
  });

  describe("resubmit", () => {
    const files = { supportive_document: [{ filename: "new.pdf" }] } as any;

    it("forbids resubmitting someone else's claim", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "OTHER", status: MedicalClaimStatus.REJECTED, type: "IN", amount: 100 });
      await expect(service.resubmit(employee, 1, {} as any, files)).rejects.toThrow(ForbiddenException);
    });

    it("only allows resubmitting rejected claims", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: MedicalClaimStatus.PENDING, type: "IN", amount: 100 });
      await expect(service.resubmit(employee, 1, {} as any, files)).rejects.toThrow(BadRequestException);
    });

    it("creates a resubmission carrying forward unset fields", async () => {
      model.findById.mockResolvedValue({
        id: 1,
        employee_id: "EMP1",
        status: MedicalClaimStatus.REJECTED,
        type: "IN",
        quarter: "2026-Q2",
        amount: 100,
        relevant_document_url: null,
      });
      model.create.mockResolvedValue({ id: 2 });
      const result = await service.resubmit(employee, 1, {} as any, files);
      expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ type: "IN", resubmission_of: 1 }));
      expect(result.message).toBe("Claim resubmitted");
    });
  });

  it("getLimits returns static limits with the current quarter", () => {
    const result = service.getLimits();
    expect(result.currentQuarter).toBe("2026-Q3");
    expect(result.limits.IN.maxPerClaim).toBe(300000);
  });
});

describe("MedicalInsuranceController", () => {
  it("getClaimById rejects a non-numeric id", () => {
    const serviceMock = { getClaimById: vi.fn() };
    const controller = new MedicalInsuranceController(serviceMock as any);
    expect(() => controller.getClaimById(employee, "abc")).toThrow(BadRequestException);
  });

  it("apply delegates to the service", () => {
    const serviceMock = { apply: vi.fn().mockReturnValue({ success: true }) };
    const controller = new MedicalInsuranceController(serviceMock as any);
    controller.apply(employee, {} as any, {} as any);
    expect(serviceMock.apply).toHaveBeenCalledWith(employee, {}, {});
  });
});
