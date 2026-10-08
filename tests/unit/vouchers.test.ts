import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole, VoucherStatus } from "../../src/types";

vi.mock("../../src/modules/vouchers/PaymentVoucher", () => ({
  PaymentVoucherModel: {
    create: vi.fn(),
    getAll: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock("../../src/modules/vendors/Vendor", () => ({
  VendorModel: { getAll: vi.fn() },
}));
vi.mock("../../src/middleware/permissions", () => ({
  hasPermission: vi.fn(),
}));

import { PaymentVoucherModel } from "../../src/modules/vouchers/PaymentVoucher";
import { VendorModel } from "../../src/modules/vendors/Vendor";
import { hasPermission } from "../../src/middleware/permissions";
import { VouchersService } from "../../src/modules/vouchers/vouchers.service";
import { VouchersController } from "../../src/modules/vouchers/vouchers.controller";

const pvm = PaymentVoucherModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const vm = VendorModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const hasPermissionMock = hasPermission as unknown as ReturnType<typeof vi.fn>;

const financeManager = { userId: 1, employeeId: "FM1", role: UserRole.FINANCE_MANAGER } as any;
const financeExecutive = { userId: 2, employeeId: "FE1", role: UserRole.FINANCE_EXECUTIVE } as any;
const employee = { userId: 3, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any;
const superAdmin = { userId: 4, employeeId: "SA1", role: UserRole.SUPER_ADMIN } as any;

describe("VouchersService", () => {
  const service = new VouchersService();

  beforeEach(() => {
    vi.clearAllMocks();
    hasPermissionMock.mockResolvedValue(false);
  });

  describe("hasRoleOrPermission (via getServiceProviders)", () => {
    it("denies access when the employee has no role/employeeId", async () => {
      await expect(service.getServiceProviders({} as any)).rejects.toThrow(ForbiddenException);
    });

    it("allows a super admin regardless of role/permission checks", async () => {
      vm.getAll.mockResolvedValue([]);
      await expect(service.getServiceProviders(superAdmin)).resolves.toEqual([]);
      expect(hasPermissionMock).not.toHaveBeenCalled();
    });

    it("allows an allowed role directly", async () => {
      vm.getAll.mockResolvedValue([{ id: 1, company_name: "Acme", email: "a@x.com" }]);
      const result = await service.getServiceProviders(financeManager);
      expect(result).toEqual([{ id: 1, company_name: "Acme", email: "a@x.com" }]);
    });

    it("falls back to the permission check for other roles", async () => {
      hasPermissionMock.mockResolvedValue(true);
      vm.getAll.mockResolvedValue([]);
      await service.getServiceProviders(employee);
      expect(hasPermissionMock).toHaveBeenCalledWith("EMP1", "vouchers.view", "read");
    });

    it("denies when the permission check fails", async () => {
      hasPermissionMock.mockResolvedValue(false);
      await expect(service.getServiceProviders(employee)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("create", () => {
    const validDto = { vendor_id: "5", amount: "100", vat: "10" } as any;

    it("forbids non-finance-manager roles by default", async () => {
      await expect(service.create(financeExecutive, validDto, undefined)).rejects.toThrow(ForbiddenException);
    });

    it("requires a vendor and amount", async () => {
      await expect(service.create(financeManager, {} as any, undefined)).rejects.toThrow(BadRequestException);
    });

    it("rejects a negative amount", async () => {
      await expect(
        service.create(financeManager, { vendor_id: "5", amount: "-1" } as any, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates the voucher, deriving vendor id from service_provider_id if vendor_id is absent", async () => {
      pvm.create.mockResolvedValue({ id: 1 });
      const file = { filename: "invoice.pdf" } as any;
      const result = await service.create(
        financeManager,
        { service_provider_id: "9", amount: "200" } as any,
        file,
      );
      expect(pvm.create).toHaveBeenCalledWith(
        expect.objectContaining({ vendor_id: 9, amount: 200, vat: 0, invoice_url: "/uploads/documents/invoice.pdf" }),
      );
      expect(result).toEqual({ id: 1 });
    });
  });

  describe("getById", () => {
    it("throws NotFoundException when missing", async () => {
      await expect(service.getById(financeManager, 1)).rejects.toThrow(NotFoundException);
    });

    it("returns the voucher when found and permitted", async () => {
      pvm.findById.mockResolvedValue({ id: 1 });
      const result = await service.getById(financeManager, 1);
      expect(result).toEqual({ id: 1 });
    });
  });

  describe("review", () => {
    it("forbids roles other than finance_executive", async () => {
      await expect(service.review(financeManager, 1, { action: "approve" } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws NotFoundException for a missing voucher", async () => {
      pvm.findById.mockResolvedValue(null);
      await expect(service.review(financeExecutive, 1, { action: "approve" } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects reviewing a voucher that isn't pending review", async () => {
      pvm.findById.mockResolvedValue({ id: 1, status: VoucherStatus.APPROVED });
      await expect(service.review(financeExecutive, 1, { action: "approve" } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects an invalid action", async () => {
      pvm.findById.mockResolvedValue({ id: 1, status: VoucherStatus.PENDING_REVIEW });
      await expect(service.review(financeExecutive, 1, { action: "delete" } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each([
      ["approve", VoucherStatus.APPROVED],
      ["reject", VoucherStatus.REJECTED],
      ["information_request", VoucherStatus.INFORMATION_REQUEST],
    ])("updates status to %s -> %s", async (action, expectedStatus) => {
      pvm.findById.mockResolvedValueOnce({ id: 1, status: VoucherStatus.PENDING_REVIEW }).mockResolvedValueOnce({
        id: 1,
        status: expectedStatus,
      });
      const result = await service.review(financeExecutive, 1, { action, comment: "note" } as any);
      expect(pvm.updateStatus).toHaveBeenCalledWith(
        1,
        expectedStatus,
        expect.objectContaining({ reviewed_by: financeExecutive.userId, executive_comment: "note" }),
      );
      expect(result).toEqual({ id: 1, status: expectedStatus });
    });
  });

  describe("resubmit", () => {
    it("forbids non-finance-manager roles", async () => {
      await expect(service.resubmit(financeExecutive, 1)).rejects.toThrow(ForbiddenException);
    });

    it("only allows resubmitting information_request vouchers", async () => {
      pvm.findById.mockResolvedValue({ id: 1, status: VoucherStatus.APPROVED });
      await expect(service.resubmit(financeManager, 1)).rejects.toThrow(BadRequestException);
    });

    it("resubmits to pending_review", async () => {
      pvm.findById
        .mockResolvedValueOnce({ id: 1, status: VoucherStatus.INFORMATION_REQUEST })
        .mockResolvedValueOnce({ id: 1, status: VoucherStatus.PENDING_REVIEW });
      const result = await service.resubmit(financeManager, 1);
      expect(pvm.updateStatus).toHaveBeenCalledWith(1, VoucherStatus.PENDING_REVIEW, expect.any(Object));
      expect(result.status).toBe(VoucherStatus.PENDING_REVIEW);
    });
  });

  describe("bankUpload / markPaid", () => {
    it("bankUpload only allows approved vouchers", async () => {
      pvm.findById.mockResolvedValue({ id: 1, status: VoucherStatus.PENDING_REVIEW });
      await expect(service.bankUpload(financeManager, 1)).rejects.toThrow(BadRequestException);
    });

    it("bankUpload transitions approved -> bank_upload", async () => {
      pvm.findById
        .mockResolvedValueOnce({ id: 1, status: VoucherStatus.APPROVED })
        .mockResolvedValueOnce({ id: 1, status: VoucherStatus.BANK_UPLOAD });
      const result = await service.bankUpload(financeManager, 1);
      expect(result.status).toBe(VoucherStatus.BANK_UPLOAD);
    });

    it("markPaid only allows bank_upload vouchers", async () => {
      hasPermissionMock.mockResolvedValue(true);
      pvm.findById.mockResolvedValue({ id: 1, status: VoucherStatus.APPROVED });
      await expect(service.markPaid(employee, 1)).rejects.toThrow(BadRequestException);
    });

    it("markPaid transitions bank_upload -> paid for a permitted non-listed role", async () => {
      hasPermissionMock.mockResolvedValue(true);
      pvm.findById
        .mockResolvedValueOnce({ id: 1, status: VoucherStatus.BANK_UPLOAD })
        .mockResolvedValueOnce({ id: 1, status: VoucherStatus.PAID });
      const result = await service.markPaid(employee, 1);
      expect(result.status).toBe(VoucherStatus.PAID);
    });
  });
});

describe("VouchersController", () => {
  const createServiceMock = () => ({
    getServiceProviders: vi.fn(),
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    review: vi.fn(),
    resubmit: vi.fn(),
    bankUpload: vi.fn(),
    markPaid: vi.fn(),
  });

  let service: ReturnType<typeof createServiceMock>;
  let controller: VouchersController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new VouchersController(service as any);
  });

  it("getById rejects a non-numeric id", () => {
    expect(() => controller.getById(financeManager, "abc")).toThrow(BadRequestException);
  });

  it("review rejects a non-numeric id", () => {
    expect(() => controller.review(financeExecutive, "abc", {} as any)).toThrow(BadRequestException);
  });

  it("markPaid delegates with the parsed id", () => {
    controller.markPaid(financeManager, "3");
    expect(service.markPaid).toHaveBeenCalledWith(financeManager, 3);
  });
});
