import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole, VoucherPaymentStatus, VoucherStatus } from "../../src/types";

vi.mock("../../src/modules/vouchers/PaymentVoucher", () => ({
  PaymentVoucherModel: {
    create: vi.fn(),
    getAll: vi.fn(),
    findById: vi.fn(),
    transition: vi.fn(),
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

    it("forbids roles without create access", async () => {
      await expect(service.create(employee, validDto, undefined)).rejects.toThrow(ForbiddenException);
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

    it("lets a Finance Executive create a voucher, routed to Finance Manager review", async () => {
      pvm.create.mockResolvedValue({ id: 2 });
      await service.create(financeExecutive, validDto, undefined);
      expect(pvm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: financeExecutive.userId,
          created_by_role: UserRole.FINANCE_EXECUTIVE,
          initial_status: VoucherStatus.PENDING_MANAGER_REVIEW,
        }),
      );
    });

    it("routes a Finance Manager's voucher straight to Administrator review", async () => {
      pvm.create.mockResolvedValue({ id: 3 });
      await service.create(financeManager, validDto, undefined);
      expect(pvm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by_role: UserRole.FINANCE_MANAGER,
          initial_status: VoucherStatus.PENDING_ADMIN_REVIEW,
        }),
      );
    });

    it("allows a voucher without a bill", async () => {
      pvm.create.mockResolvedValue({ id: 4 });
      await service.create(financeExecutive, validDto, undefined);
      expect(pvm.create).toHaveBeenCalledWith(expect.objectContaining({ invoice_url: null }));
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

  describe("getAll / getApprovalQueue", () => {
    it("passes status and payment_status filters through", async () => {
      pvm.getAll.mockResolvedValue([]);
      await service.getAll(financeExecutive, VoucherStatus.APPROVED, VoucherPaymentStatus.UNPAID);
      expect(pvm.getAll).toHaveBeenCalledWith({ status: "approved", payment_status: "unpaid" });
    });

    it("rejects an unknown status filter", async () => {
      await expect(service.getAll(financeExecutive, "bank_upload" as any)).rejects.toThrow(BadRequestException);
      await expect(service.getAll(financeExecutive, undefined, "nope" as any)).rejects.toThrow(BadRequestException);
    });

    it("lists only pending_admin_review vouchers for the Administrator's queue", async () => {
      pvm.getAll.mockResolvedValue([{ id: 7 }]);
      await expect(service.getApprovalQueue(superAdmin)).resolves.toEqual([{ id: 7 }]);
      expect(pvm.getAll).toHaveBeenCalledWith({ status: VoucherStatus.PENDING_ADMIN_REVIEW });
    });

    it.each([
      ["finance manager", financeManager],
      ["finance executive", financeExecutive],
    ])("denies the queue to a %s", async (_label, user) => {
      await expect(service.getApprovalQueue(user)).rejects.toThrow(ForbiddenException);
    });

    it("allows the queue for a user granted vouchers.admin_review", async () => {
      hasPermissionMock.mockResolvedValue(true);
      pvm.getAll.mockResolvedValue([]);
      await service.getApprovalQueue(employee);
      expect(hasPermissionMock).toHaveBeenCalledWith("EMP1", "vouchers.admin_review", "write");
    });
  });

  describe("review - Finance Manager stage", () => {
    const pendingManager = { id: 1, status: VoucherStatus.PENDING_MANAGER_REVIEW };

    it("forbids a Finance Executive from reviewing", async () => {
      await expect(service.review(financeExecutive, 1, { action: "approve" } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(pvm.transition).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for a missing voucher", async () => {
      pvm.findById.mockResolvedValue(null);
      await expect(service.review(financeManager, 1, { action: "approve" } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects an invalid action (e.g. the removed information_request)", async () => {
      await expect(
        service.review(financeManager, 1, { action: "information_request", comment: "x" } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("approving routes the voucher to Administrator review", async () => {
      pvm.findById.mockResolvedValueOnce(pendingManager).mockResolvedValueOnce({ id: 1 });
      pvm.transition.mockResolvedValue(true);
      await service.review(financeManager, 1, { action: "approve" } as any);
      expect(pvm.transition).toHaveBeenCalledWith(
        1,
        { status: VoucherStatus.PENDING_MANAGER_REVIEW },
        expect.objectContaining({
          status: VoucherStatus.PENDING_ADMIN_REVIEW,
          manager_reviewed_by: financeManager.userId,
          manager_reviewed_at: expect.any(Date),
        }),
      );
      const set = pvm.transition.mock.calls[0][2];
      expect(set).not.toHaveProperty("payment_status");
    });

    it.each([undefined, "", "   "])("rejecting without a reason (%j) is refused", async (comment) => {
      await expect(service.review(financeManager, 1, { action: "reject", comment } as any)).rejects.toThrow(
        "A rejection reason is required",
      );
      expect(pvm.transition).not.toHaveBeenCalled();
    });

    it("rejecting records the trimmed reason, user and time (Scenario 3)", async () => {
      pvm.findById.mockResolvedValueOnce(pendingManager).mockResolvedValueOnce({ id: 1, status: "rejected" });
      pvm.transition.mockResolvedValue(true);
      await service.review(financeManager, 1, {
        action: "reject",
        comment: "  Inadequate supporting invoice details provided ",
      } as any);
      expect(pvm.transition).toHaveBeenCalledWith(
        1,
        { status: VoucherStatus.PENDING_MANAGER_REVIEW },
        expect.objectContaining({
          status: VoucherStatus.REJECTED,
          rejection_reason: "Inadequate supporting invoice details provided",
          rejected_by: financeManager.userId,
          rejected_at: expect.any(Date),
        }),
      );
    });

    it("is refused when another reviewer got there first (compare-and-set fails)", async () => {
      pvm.findById.mockResolvedValue(pendingManager);
      pvm.transition.mockResolvedValue(false);
      await expect(service.review(financeManager, 1, { action: "approve" } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each([VoucherStatus.APPROVED, VoucherStatus.REJECTED])("cannot review a %s voucher", async (status) => {
      pvm.findById.mockResolvedValue({ id: 1, status });
      await expect(service.review(financeManager, 1, { action: "approve" } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("the Finance Manager cannot act on a voucher already at the Administrator stage", async () => {
      pvm.findById.mockResolvedValue({ id: 1, status: VoucherStatus.PENDING_ADMIN_REVIEW });
      await expect(service.review(financeManager, 1, { action: "approve" } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(pvm.transition).not.toHaveBeenCalled();
    });
  });

  describe("review - Administrator stage", () => {
    const pendingAdmin = { id: 1, status: VoucherStatus.PENDING_ADMIN_REVIEW };

    it("approving makes the voucher Approved with payment status Unpaid (Scenario 2)", async () => {
      pvm.findById.mockResolvedValueOnce(pendingAdmin).mockResolvedValueOnce({ id: 1 });
      pvm.transition.mockResolvedValue(true);
      await service.review(superAdmin, 1, { action: "approve" } as any);
      expect(pvm.transition).toHaveBeenCalledWith(
        1,
        { status: VoucherStatus.PENDING_ADMIN_REVIEW },
        expect.objectContaining({
          status: VoucherStatus.APPROVED,
          payment_status: VoucherPaymentStatus.UNPAID,
          admin_reviewed_by: superAdmin.userId,
          admin_reviewed_at: expect.any(Date),
        }),
      );
    });

    it("rejecting needs a reason and returns the voucher to the creator as Rejected", async () => {
      await expect(service.review(superAdmin, 1, { action: "reject" } as any)).rejects.toThrow(BadRequestException);

      pvm.findById.mockResolvedValueOnce(pendingAdmin).mockResolvedValueOnce({ id: 1 });
      pvm.transition.mockResolvedValue(true);
      await service.review(superAdmin, 1, { action: "reject", comment: "Over budget" } as any);
      expect(pvm.transition).toHaveBeenCalledWith(
        1,
        { status: VoucherStatus.PENDING_ADMIN_REVIEW },
        expect.objectContaining({ status: VoucherStatus.REJECTED, rejection_reason: "Over budget" }),
      );
    });

    it("a user granted vouchers.admin_review can give final approval", async () => {
      hasPermissionMock.mockImplementation(async (_id: string, key: string) => key === "vouchers.admin_review");
      pvm.findById.mockResolvedValueOnce(pendingAdmin).mockResolvedValueOnce({ id: 1 });
      pvm.transition.mockResolvedValue(true);
      await service.review(employee, 1, { action: "approve" } as any);
      expect(pvm.transition).toHaveBeenCalled();
    });

    it("a Finance Manager cannot give final approval", async () => {
      pvm.findById.mockResolvedValue(pendingAdmin);
      await expect(service.review(financeManager, 1, { action: "approve" } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(pvm.transition).not.toHaveBeenCalled();
    });
  });

  describe("payment tracking (Finance Executive)", () => {
    const unpaid = { id: 1, status: VoucherStatus.APPROVED, payment_status: VoucherPaymentStatus.UNPAID };
    const uploaded = { ...unpaid, payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT };

    it("only the Finance Executive (or a permitted user) can update payment status", async () => {
      await expect(service.bankUpload(financeManager, 1)).rejects.toThrow(ForbiddenException);
      await expect(service.markPaid(financeManager, 1)).rejects.toThrow(ForbiddenException);
    });

    it("Unpaid -> Uploaded for Payment records user and time (Scenario 1)", async () => {
      pvm.findById.mockResolvedValueOnce(unpaid).mockResolvedValueOnce(uploaded);
      pvm.transition.mockResolvedValue(true);
      const result = await service.bankUpload(financeExecutive, 1);
      expect(pvm.transition).toHaveBeenCalledWith(
        1,
        { status: VoucherStatus.APPROVED, payment_status: VoucherPaymentStatus.UNPAID },
        {
          payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT,
          bank_upload_by: financeExecutive.userId,
          bank_upload_at: expect.any(Date),
        },
      );
      expect(result.payment_status).toBe(VoucherPaymentStatus.UPLOADED_FOR_PAYMENT);
    });

    it("Uploaded for Payment -> Paid records user and time (Scenario 1)", async () => {
      pvm.findById.mockResolvedValueOnce(uploaded).mockResolvedValueOnce({ ...uploaded, payment_status: "paid" });
      pvm.transition.mockResolvedValue(true);
      await service.markPaid(financeExecutive, 1);
      expect(pvm.transition).toHaveBeenCalledWith(
        1,
        { status: VoucherStatus.APPROVED, payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT },
        { payment_status: VoucherPaymentStatus.PAID, paid_by: financeExecutive.userId, paid_at: expect.any(Date) },
      );
    });

    it.each([VoucherStatus.PENDING_MANAGER_REVIEW, VoucherStatus.PENDING_ADMIN_REVIEW, VoucherStatus.REJECTED])(
      "a %s voucher cannot enter the payment lifecycle",
      async (status) => {
        pvm.findById.mockResolvedValue({ id: 1, status, payment_status: null });
        await expect(service.bankUpload(financeExecutive, 1)).rejects.toThrow(BadRequestException);
        await expect(service.markPaid(financeExecutive, 1)).rejects.toThrow(BadRequestException);
        expect(pvm.transition).not.toHaveBeenCalled();
      },
    );

    it("cannot skip a stage: Unpaid -> Paid is refused", async () => {
      pvm.findById.mockResolvedValue(unpaid);
      pvm.transition.mockResolvedValue(false); // the DB-side guard also requires uploaded_for_payment
      await expect(service.markPaid(financeExecutive, 1)).rejects.toThrow(BadRequestException);
    });

    it("bankUpload cannot be used to go backwards: a Paid voucher is not 'marked uploaded' again", async () => {
      pvm.findById.mockResolvedValue({ ...unpaid, payment_status: VoucherPaymentStatus.PAID });
      pvm.transition.mockResolvedValue(false);
      await expect(service.bankUpload(financeExecutive, 1)).rejects.toThrow(BadRequestException);
    });

    describe("revertPayment (one stage back)", () => {
      const paid = { ...unpaid, payment_status: VoucherPaymentStatus.PAID };

      it("Paid -> Uploaded for Payment clears who/when of the payment", async () => {
        pvm.findById.mockResolvedValueOnce(paid).mockResolvedValueOnce(uploaded);
        pvm.transition.mockResolvedValue(true);
        const result = await service.revertPayment(financeExecutive, 1);
        expect(pvm.transition).toHaveBeenCalledWith(
          1,
          { status: VoucherStatus.APPROVED, payment_status: VoucherPaymentStatus.PAID },
          { payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT, paid_by: null, paid_at: null },
        );
        expect(result.payment_status).toBe(VoucherPaymentStatus.UPLOADED_FOR_PAYMENT);
      });

      it("Uploaded for Payment -> Unpaid clears who/when of the upload", async () => {
        pvm.findById.mockResolvedValueOnce(uploaded).mockResolvedValueOnce(unpaid);
        pvm.transition.mockResolvedValue(true);
        await service.revertPayment(financeExecutive, 1);
        expect(pvm.transition).toHaveBeenCalledWith(
          1,
          { status: VoucherStatus.APPROVED, payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT },
          { payment_status: VoucherPaymentStatus.UNPAID, bank_upload_by: null, bank_upload_at: null },
        );
      });

      it("an Unpaid voucher has nothing to revert", async () => {
        pvm.findById.mockResolvedValue(unpaid);
        await expect(service.revertPayment(financeExecutive, 1)).rejects.toThrow(BadRequestException);
        expect(pvm.transition).not.toHaveBeenCalled();
      });

      it("refuses when the voucher changed underneath (compare-and-set lost)", async () => {
        pvm.findById.mockResolvedValue(paid);
        pvm.transition.mockResolvedValue(false);
        await expect(service.revertPayment(financeExecutive, 1)).rejects.toThrow(BadRequestException);
      });

      it("only someone allowed to make the stage being left can revert it", async () => {
        pvm.findById.mockResolvedValue(paid);
        await expect(service.revertPayment(financeManager, 1)).rejects.toThrow(ForbiddenException);
        expect(pvm.transition).not.toHaveBeenCalled();
      });

      it("throws NotFoundException for a missing voucher", async () => {
        pvm.findById.mockResolvedValue(null);
        await expect(service.revertPayment(financeExecutive, 1)).rejects.toThrow(NotFoundException);
      });
    });

    it("throws NotFoundException for a missing voucher", async () => {
      pvm.findById.mockResolvedValue(null);
      await expect(service.bankUpload(financeExecutive, 1)).rejects.toThrow(NotFoundException);
      await expect(service.markPaid(financeExecutive, 1)).rejects.toThrow(NotFoundException);
    });
  });
});

describe("VouchersService - approved-unpaid Excel export", () => {
  const service = new VouchersService();
  const row = (over: any) => ({
    id: 1,
    voucher_number: "VOU-2026-0001",
    status: VoucherStatus.APPROVED,
    payment_status: VoucherPaymentStatus.UNPAID,
    sp_company_name: "Acme",
    amount: "1000.50",
    vat: "100",
    created_at: "2026-11-01T09:00:00",
    created_by_first_name: "Eve",
    created_by_last_name: "Executive",
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hasPermissionMock.mockResolvedValue(false);
  });

  it("asks only for approved vouchers and keeps Unpaid + Uploaded, dropping Paid", async () => {
    pvm.getAll.mockResolvedValue([
      row({ id: 1, voucher_number: "V-1" }),
      row({ id: 2, voucher_number: "V-2", payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT }),
      row({ id: 3, voucher_number: "V-3", payment_status: VoucherPaymentStatus.PAID }),
    ]);
    const wb = await service.buildApprovedUnpaidWorkbook(financeExecutive);
    expect(pvm.getAll).toHaveBeenCalledWith({ status: VoucherStatus.APPROVED });
    const sheet = wb.worksheets[0];
    const numbers = (sheet.getColumn("voucher_number").values as any[]).slice(2);
    expect(numbers).toEqual(["V-1", "V-2", "Total"]);
    expect(sheet.getRow(2).getCell("payment_status").value).toBe("Unpaid");
    expect(sheet.getRow(3).getCell("payment_status").value).toBe("Uploaded for Payment");
  });

  it("writes numeric amounts and a totals row", async () => {
    pvm.getAll.mockResolvedValue([row({ id: 1 }), row({ id: 2, amount: "500", vat: "0" })]);
    const sheet = (await service.buildApprovedUnpaidWorkbook(financeExecutive)).worksheets[0];
    expect(sheet.getRow(2).getCell("amount").value).toBe(1000.5);
    const total = sheet.getRow(4);
    expect(total.getCell("voucher_number").value).toBe("Total");
    expect(total.getCell("amount").value).toBe(1500.5);
    expect(total.getCell("vat").value).toBe(100);
  });

  it("includes the creator name and tolerates missing names/dates", async () => {
    pvm.getAll.mockResolvedValue([
      row({ id: 1 }),
      row({ id: 2, created_by_first_name: undefined, created_by_last_name: undefined, created_at: null }),
    ]);
    const sheet = (await service.buildApprovedUnpaidWorkbook(financeExecutive)).worksheets[0];
    // A voucher with no created_at sorts first (epoch); the dated one follows.
    expect(sheet.getRow(2).getCell("created_by").value).toBe("");
    expect(sheet.getRow(2).getCell("created_at").value).toBe("");
    expect(sheet.getRow(3).getCell("created_by").value).toBe("Eve Executive");
  });

  it("with nothing to pay it is just a header and a zero total", async () => {
    pvm.getAll.mockResolvedValue([]);
    const sheet = (await service.buildApprovedUnpaidWorkbook(financeExecutive)).worksheets[0];
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell("amount").value).toBe(0);
  });

  it("is refused without view access", async () => {
    await expect(service.buildApprovedUnpaidWorkbook(employee)).rejects.toThrow(ForbiddenException);
    expect(pvm.getAll).not.toHaveBeenCalled();
  });
});

describe("VouchersController", () => {
  const createServiceMock = () => ({
    getServiceProviders: vi.fn(),
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    getApprovalQueue: vi.fn(),
    review: vi.fn(),
    bankUpload: vi.fn(),
    markPaid: vi.fn(),
    revertPayment: vi.fn(),
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

  it("revertPayment delegates with the parsed id and rejects a bad one", () => {
    controller.revertPayment(financeExecutive, "3");
    expect(service.revertPayment).toHaveBeenCalledWith(financeExecutive, 3);
    expect(() => controller.revertPayment(financeExecutive, "x")).toThrow(BadRequestException);
  });

  it("markPaid delegates with the parsed id", () => {
    controller.markPaid(financeExecutive, "3");
    expect(service.markPaid).toHaveBeenCalledWith(financeExecutive, 3);
  });

  it("getAll forwards the status and payment_status filters", () => {
    controller.getAll(financeExecutive, VoucherStatus.APPROVED, VoucherPaymentStatus.UNPAID);
    expect(service.getAll).toHaveBeenCalledWith(financeExecutive, "approved", "unpaid");
  });

  it("serves the approval queue", () => {
    controller.getApprovalQueue(superAdmin);
    expect(service.getApprovalQueue).toHaveBeenCalledWith(superAdmin);
  });
});
