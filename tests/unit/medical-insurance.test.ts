import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MedicalClaimPaymentStatus, MedicalClaimStatus, MedicalClaimType, UserRole } from "../../src/types";

vi.mock("../../src/modules/medical-insurance/MedicalInsurance", () => ({
  MedicalInsuranceModel: {
    getUsedOPDAmountForQuarter: vi.fn(),
    create: vi.fn(),
    findByEmployeeId: vi.fn(),
    getAll: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    recordPayment: vi.fn(),
    cancel: vi.fn(),
    persistDocumentBlob: vi.fn().mockResolvedValue(undefined),
    getDocumentBlob: vi.fn(),
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
// No hire_date on file by default -> assertServiceEligibility no-ops (see its own tests below for the enforced case).
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByEmployeeId: vi.fn().mockResolvedValue(null) },
}));

import { MedicalInsuranceModel } from "../../src/modules/medical-insurance/MedicalInsurance";
import { sendMedicalClaimSubmittedEmail } from "../../src/config/email";
import { EmployeeModel } from "../../src/employees/Employee";
import { MedicalInsuranceService } from "../../src/modules/medical-insurance/medical-insurance.service";
import { MedicalInsuranceController } from "../../src/modules/medical-insurance/medical-insurance.controller";

const model = MedicalInsuranceModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const submittedEmailMock = sendMedicalClaimSubmittedEmail as unknown as ReturnType<typeof vi.fn>;
const employeeModel = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

const employee = { userId: 1, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any;
const hr = { userId: 2, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;
const finance = { userId: 3, employeeId: "FIN1", role: UserRole.FINANCE_MANAGER } as any;
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("MedicalInsuranceService", () => {
  const service = new MedicalInsuranceService();

  beforeEach(() => {
    vi.clearAllMocks();
    employeeModel.findByEmployeeId.mockResolvedValue(null);
    model.persistDocumentBlob.mockResolvedValue(undefined);
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

    it("rejects submission when the employee has under 6 months of service (OCD-489)", async () => {
      const hireDate = new Date();
      hireDate.setMonth(hireDate.getMonth() - 1);
      employeeModel.findByEmployeeId.mockResolvedValue({ hireDate });
      await expect(service.apply(employee, { type: "IN", amount: "100" } as any, files)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("allows submission once 6 months of service have passed (OCD-489)", async () => {
      const hireDate = new Date();
      hireDate.setMonth(hireDate.getMonth() - 7);
      employeeModel.findByEmployeeId.mockResolvedValue({ hireDate });
      model.create.mockResolvedValue({ id: 1, type: "IN", amount: 100 });
      const result = await service.apply(employee, { type: "IN", amount: "100" } as any, files);
      expect(result.message).toBe("Medical insurance claim submitted");
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

    it("routes Finance to getAll (OCD-494)", async () => {
      model.getAll.mockResolvedValue([{ id: 1 }]);
      const result = await service.getClaims(finance);
      expect(model.getAll).toHaveBeenCalled();
      expect(result.claims).toEqual([{ id: 1 }]);
    });

    it("forces the caller's own claims when mine=true, even for HR/Super Admin (OCD-488)", async () => {
      model.findByEmployeeId.mockResolvedValue([{ id: 5 }]);
      const result = await service.getClaims(hr, undefined, undefined, true);
      expect(model.findByEmployeeId).toHaveBeenCalledWith("HR1", { status: undefined });
      expect(model.getAll).not.toHaveBeenCalled();
      expect(result.claims).toEqual([{ id: 5 }]);
    });

    it("returns an empty list for mine=true when the caller has no employeeId (OCD-488)", async () => {
      const result = await service.getClaims({ ...hr, employeeId: null }, undefined, undefined, true);
      expect(result.claims).toEqual([]);
      expect(model.findByEmployeeId).not.toHaveBeenCalled();
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

  describe("recordPayment", () => {
    const dto = (overrides: any = {}) => ({
      payment_status: MedicalClaimPaymentStatus.PAID,
      paid_amount: "100",
      payment_date: "2026-09-20",
      ...overrides,
    });

    it("forbids roles outside HR/Finance/SuperAdmin", async () => {
      await expect(service.recordPayment(employee, 1, dto())).rejects.toThrow(ForbiddenException);
    });

    it("rejects an invalid payment_status", async () => {
      await expect(service.recordPayment(hr, 1, dto({ payment_status: "cash" }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws NotFoundException for a missing claim", async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.recordPayment(hr, 1, dto())).rejects.toThrow(NotFoundException);
    });

    it("rejects claims that are not approved", async () => {
      model.findById.mockResolvedValue({ id: 1, status: MedicalClaimStatus.PENDING, amount: 100 });
      await expect(service.recordPayment(hr, 1, dto())).rejects.toThrow(BadRequestException);
    });

    it("requires an amount when marking Paid", async () => {
      model.findById.mockResolvedValue({ id: 1, status: MedicalClaimStatus.APPROVED, amount: 100 });
      await expect(
        service.recordPayment(hr, 1, dto({ paid_amount: undefined })),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an amount above the approved claim amount", async () => {
      model.findById.mockResolvedValue({ id: 1, status: MedicalClaimStatus.APPROVED, amount: 100 });
      await expect(service.recordPayment(hr, 1, dto({ paid_amount: "500" }))).rejects.toThrow(BadRequestException);
    });

    it("requires a payment date when marking Paid", async () => {
      model.findById.mockResolvedValue({ id: 1, status: MedicalClaimStatus.APPROVED, amount: 100 });
      await expect(
        service.recordPayment(hr, 1, dto({ payment_date: undefined })),
      ).rejects.toThrow(BadRequestException);
    });

    it("allows Not Paid without an amount or date", async () => {
      model.findById.mockResolvedValue({ id: 1, status: MedicalClaimStatus.APPROVED, amount: 100 });
      model.recordPayment.mockResolvedValue({ id: 1, payment_status: MedicalClaimPaymentStatus.NOT_PAID });
      const result = await service.recordPayment(
        finance,
        1,
        dto({ payment_status: MedicalClaimPaymentStatus.NOT_PAID, paid_amount: undefined, payment_date: undefined }),
      );
      expect(model.recordPayment).toHaveBeenCalledWith(
        1,
        MedicalClaimPaymentStatus.NOT_PAID,
        expect.objectContaining({ paid_amount: null, payment_date: null, paid_by: finance.userId }),
      );
      expect(result.message).toBe("Payment details recorded");
    });

    it("records a Paid payment for an approved claim", async () => {
      model.findById.mockResolvedValue({ id: 1, status: MedicalClaimStatus.APPROVED, amount: 100 });
      model.recordPayment.mockResolvedValue({ id: 1, payment_status: MedicalClaimPaymentStatus.PAID });
      const result = await service.recordPayment(finance, 1, dto({ payment_reference: "BANK-REF-1" }));
      expect(model.recordPayment).toHaveBeenCalledWith(
        1,
        MedicalClaimPaymentStatus.PAID,
        expect.objectContaining({ paid_amount: 100, payment_reference: "BANK-REF-1", paid_by: finance.userId }),
      );
      expect(result.claim).toEqual({ id: 1, payment_status: MedicalClaimPaymentStatus.PAID });
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

  describe("cancelClaim", () => {
    it("throws NotFoundException for a missing claim", async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.cancelClaim(employee, 1)).rejects.toThrow(NotFoundException);
    });

    it("forbids cancelling someone else's claim", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "OTHER", status: MedicalClaimStatus.PENDING });
      await expect(service.cancelClaim(employee, 1)).rejects.toThrow(ForbiddenException);
    });

    it("only allows cancelling claims that are still pending", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: MedicalClaimStatus.APPROVED });
      await expect(service.cancelClaim(employee, 1)).rejects.toThrow(BadRequestException);
    });

    it("cancels a pending claim owned by the employee", async () => {
      model.findById.mockResolvedValue({ id: 1, employee_id: "EMP1", status: MedicalClaimStatus.PENDING });
      model.cancel.mockResolvedValue({ id: 1, status: MedicalClaimStatus.CANCELLED });
      const result = await service.cancelClaim(employee, 1);
      expect(model.cancel).toHaveBeenCalledWith(1);
      expect(result.message).toBe("Claim cancelled");
    });
  });

  describe("getOpdBalance", () => {
    it("returns used and remaining balance for the current quarter", async () => {
      model.getUsedOPDAmountForQuarter.mockResolvedValue(4000);
      const result = await service.getOpdBalance(employee);
      expect(result.quarter).toBe("2026-Q3");
      expect(result.limit).toBe(6000);
      expect(result.used).toBe(4000);
      expect(result.remaining).toBe(2000);
    });

    it("floors the remaining balance at zero when usage already exceeds the limit", async () => {
      model.getUsedOPDAmountForQuarter.mockResolvedValue(9000);
      const result = await service.getOpdBalance(employee);
      expect(result.remaining).toBe(0);
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

  it("recordPayment rejects a non-numeric id", () => {
    const serviceMock = { recordPayment: vi.fn() };
    const controller = new MedicalInsuranceController(serviceMock as any);
    expect(() => controller.recordPayment(hr, "abc", {} as any)).toThrow(BadRequestException);
  });

  it("recordPayment delegates to the service", () => {
    const serviceMock = { recordPayment: vi.fn().mockReturnValue({ success: true }) };
    const controller = new MedicalInsuranceController(serviceMock as any);
    const dto = { payment_status: "paid" } as any;
    controller.recordPayment(finance, "1", dto);
    expect(serviceMock.recordPayment).toHaveBeenCalledWith(finance, 1, dto);
  });

  it("cancelClaim rejects a non-numeric id", () => {
    const serviceMock = { cancelClaim: vi.fn() };
    const controller = new MedicalInsuranceController(serviceMock as any);
    expect(() => controller.cancelClaim(employee, "abc")).toThrow(BadRequestException);
  });

  it("cancelClaim delegates to the service", () => {
    const serviceMock = { cancelClaim: vi.fn().mockReturnValue({ success: true }) };
    const controller = new MedicalInsuranceController(serviceMock as any);
    controller.cancelClaim(employee, "1");
    expect(serviceMock.cancelClaim).toHaveBeenCalledWith(employee, 1);
  });

  it("getClaims passes mine=true only when the query string says so", () => {
    const serviceMock = { getClaims: vi.fn().mockReturnValue({ success: true }) };
    const controller = new MedicalInsuranceController(serviceMock as any);
    controller.getClaims(employee, undefined, undefined, "true");
    expect(serviceMock.getClaims).toHaveBeenCalledWith(employee, undefined, undefined, true);
  });
});
