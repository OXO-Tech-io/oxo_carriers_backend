import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PaymentVoucherModel } from './PaymentVoucher';
import { VendorModel } from '../vendors/Vendor';
import { JwtPayload, UserRole, VoucherPaymentStatus, VoucherStatus } from '../../types';
import { hasPermission } from '../../middleware/permissions';
import { AccessLevel, PERMISSIONS, PermissionKey } from '../../common/constants/permissions';
import { VOUCHER_ERRORS } from '../../common/constants/errorMessages';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { ReviewVoucherDto } from './dto/review-voucher.dto';

const FINANCE_MANAGER = UserRole.FINANCE_MANAGER;
const FINANCE_EXECUTIVE = UserRole.FINANCE_EXECUTIVE;
const ADMINISTRATOR = UserRole.SUPER_ADMIN;

@Injectable()
export class VouchersService {
  private async hasRoleOrPermission(
    employee: JwtPayload,
    allowedRoles: UserRole[],
    permission: PermissionKey,
    requiredLevel: AccessLevel = 'read',
  ): Promise<boolean> {
    const role = employee?.role;
    const employeeId = employee?.employeeId;

    if (!role || !employeeId) {
      return false;
    }

    if (role === UserRole.SUPER_ADMIN || allowedRoles.includes(role)) {
      return true;
    }

    return hasPermission(employeeId, permission, requiredLevel);
  }

  /** The Administrator (super admin) or anyone granted `vouchers.admin_review`.
   * Unlike hasRoleOrPermission, no finance role is implicitly allowed. */
  private canAdminReview(employee: JwtPayload): Promise<boolean> {
    return this.hasRoleOrPermission(employee, [ADMINISTRATOR], PERMISSIONS.VOUCHERS_ADMIN_REVIEW, 'write');
  }

  private canManagerReview(employee: JwtPayload): Promise<boolean> {
    return this.hasRoleOrPermission(employee, [FINANCE_MANAGER], PERMISSIONS.VOUCHERS_REVIEW, 'write');
  }

  /** GET /vouchers/service-providers - list vendors (for create voucher dropdown). */
  async getServiceProviders(employee: JwtPayload) {
    const canView = await this.hasRoleOrPermission(employee, [FINANCE_MANAGER, FINANCE_EXECUTIVE], PERMISSIONS.VOUCHERS_VIEW);
    if (!canView) {
      throw new ForbiddenException('Forbidden');
    }
    const vendors = await VendorModel.getAll({});
    return vendors.map((v) => ({
      id: v.id,
      company_name: v.company_name,
      email: v.email,
    }));
  }

  /**
   * Finance Executive or Finance Manager creates a voucher (bill optional).
   * Executive-created vouchers go to the Finance Manager first; everything
   * else goes straight to the Administrator.
   */
  async create(employee: JwtPayload, dto: CreateVoucherDto, file: Express.Multer.File | undefined) {
    const canCreate = await this.hasRoleOrPermission(
      employee,
      [FINANCE_MANAGER, FINANCE_EXECUTIVE],
      PERMISSIONS.VOUCHERS_CREATE,
      'write',
    );
    if (!canCreate) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_CREATE);
    }

    const { service_provider_id, vendor_id, amount, vat, description } = dto;
    const vid =
      vendor_id != null ? parseInt(vendor_id, 10) : service_provider_id != null ? parseInt(service_provider_id, 10) : null;
    const created_by = employee.userId;
    const invoice_url = file ? `/uploads/documents/${file.filename}` : null;
    if (vid == null || isNaN(vid) || amount == null || amount === '') {
      throw new BadRequestException(VOUCHER_ERRORS.VENDOR_AND_AMOUNT_REQUIRED);
    }
    const vatNum = vat != null && vat !== '' ? parseFloat(vat) : 0;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0) {
      throw new BadRequestException(VOUCHER_ERRORS.INVALID_AMOUNT);
    }
    const initialStatus =
      employee.role === FINANCE_EXECUTIVE ? VoucherStatus.PENDING_MANAGER_REVIEW : VoucherStatus.PENDING_ADMIN_REVIEW;
    return PaymentVoucherModel.create({
      created_by: Number(created_by),
      created_by_role: employee.role,
      initial_status: initialStatus,
      vendor_id: vid,
      amount: amountNum,
      vat: vatNum,
      description: description || null,
      invoice_url,
    });
  }

  async getAll(employee: JwtPayload, status?: VoucherStatus, paymentStatus?: VoucherPaymentStatus) {
    const canView = await this.hasRoleOrPermission(employee, [FINANCE_MANAGER, FINANCE_EXECUTIVE], PERMISSIONS.VOUCHERS_VIEW);
    if (!canView) {
      throw new ForbiddenException('Forbidden');
    }
    if (status && !Object.values(VoucherStatus).includes(status)) {
      throw new BadRequestException('Invalid status filter');
    }
    if (paymentStatus && !Object.values(VoucherPaymentStatus).includes(paymentStatus)) {
      throw new BadRequestException('Invalid payment status filter');
    }
    return PaymentVoucherModel.getAll({ status, payment_status: paymentStatus });
  }

  /** Administrator's approval queue: every voucher awaiting final approval
   * (manager-created, and executive-created ones the Finance Manager approved). */
  async getApprovalQueue(employee: JwtPayload) {
    if (!(await this.canAdminReview(employee))) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_ADMIN_REVIEW);
    }
    return PaymentVoucherModel.getAll({ status: VoucherStatus.PENDING_ADMIN_REVIEW });
  }

  async getById(employee: JwtPayload, id: number) {
    const canView = await this.hasRoleOrPermission(employee, [FINANCE_MANAGER, FINANCE_EXECUTIVE], PERMISSIONS.VOUCHERS_VIEW);
    if (!canView) {
      throw new ForbiddenException('Forbidden');
    }
    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);
    return voucher;
  }

  /**
   * Approve or reject at whichever stage the voucher is in:
   *  - pending_manager_review: Finance Manager. Approve -> pending_admin_review.
   *  - pending_admin_review:   Administrator.   Approve -> approved (payment unpaid).
   * Reject at either stage needs a reason and sets status = rejected.
   */
  async review(employee: JwtPayload, id: number, dto: ReviewVoucherDto) {
    const [canManager, canAdmin] = await Promise.all([this.canManagerReview(employee), this.canAdminReview(employee)]);
    if (!canManager && !canAdmin) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_REVIEW);
    }

    const action = dto.action;
    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException(VOUCHER_ERRORS.INVALID_ACTION);
    }
    const reason = dto.comment?.trim();
    if (action === 'reject' && !reason) {
      throw new BadRequestException(VOUCHER_ERRORS.REJECTION_REASON_REQUIRED);
    }

    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);

    const stage = voucher.status as VoucherStatus;
    const isManagerStage = stage === VoucherStatus.PENDING_MANAGER_REVIEW;
    const isAdminStage = stage === VoucherStatus.PENDING_ADMIN_REVIEW;
    if (!isManagerStage && !isAdminStage) {
      throw new BadRequestException(VOUCHER_ERRORS.NOT_PENDING_REVIEW);
    }
    if (isManagerStage && !canManager) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_REVIEW);
    }
    if (isAdminStage && !canAdmin) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_ADMIN_REVIEW);
    }

    const actor = Number(employee.userId);
    const now = new Date();
    const stageColumns = isManagerStage
      ? { manager_reviewed_by: actor, manager_reviewed_at: now }
      : { admin_reviewed_by: actor, admin_reviewed_at: now };

    let changes;
    if (action === 'reject') {
      changes = {
        ...stageColumns,
        status: VoucherStatus.REJECTED,
        rejection_reason: reason,
        rejected_by: actor,
        rejected_at: now,
      };
    } else if (isManagerStage) {
      changes = { ...stageColumns, status: VoucherStatus.PENDING_ADMIN_REVIEW };
    } else {
      changes = { ...stageColumns, status: VoucherStatus.APPROVED, payment_status: VoucherPaymentStatus.UNPAID };
    }

    const applied = await PaymentVoucherModel.transition(id, { status: stage }, changes);
    if (!applied) {
      // Someone else reviewed it between our read and write.
      throw new BadRequestException(VOUCHER_ERRORS.NOT_PENDING_REVIEW);
    }
    return PaymentVoucherModel.findById(id);
  }

  /** Finance Executive: Unpaid -> Uploaded for Payment (records user + time). */
  async bankUpload(employee: JwtPayload, id: number) {
    const canBankUpload = await this.hasRoleOrPermission(
      employee,
      [FINANCE_EXECUTIVE],
      PERMISSIONS.VOUCHERS_BANK_UPLOAD,
      'write',
    );
    if (!canBankUpload) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_BANK_UPLOAD);
    }
    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);

    const applied =
      voucher.status === VoucherStatus.APPROVED &&
      (await PaymentVoucherModel.transition(
        id,
        { status: VoucherStatus.APPROVED, payment_status: VoucherPaymentStatus.UNPAID },
        {
          payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT,
          bank_upload_by: Number(employee.userId),
          bank_upload_at: new Date(),
        },
      ));
    if (!applied) {
      throw new BadRequestException(VOUCHER_ERRORS.ONLY_UNPAID_CAN_BE_UPLOADED);
    }
    return PaymentVoucherModel.findById(id);
  }

  /** Finance Executive: Uploaded for Payment -> Paid (final; records user + time). */
  async markPaid(employee: JwtPayload, id: number) {
    const canMarkPaid = await this.hasRoleOrPermission(
      employee,
      [FINANCE_EXECUTIVE],
      PERMISSIONS.VOUCHERS_MARK_PAID,
      'write',
    );
    if (!canMarkPaid) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_MARK_PAID);
    }
    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);

    const applied =
      voucher.status === VoucherStatus.APPROVED &&
      (await PaymentVoucherModel.transition(
        id,
        { status: VoucherStatus.APPROVED, payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT },
        {
          payment_status: VoucherPaymentStatus.PAID,
          paid_by: Number(employee.userId),
          paid_at: new Date(),
        },
      ));
    if (!applied) {
      throw new BadRequestException(VOUCHER_ERRORS.ONLY_UPLOADED_CAN_MARK_PAID);
    }
    return PaymentVoucherModel.findById(id);
  }

  /**
   * Finance Executive: move the payment status back one stage (Paid -> Uploaded
   * for Payment, Uploaded for Payment -> Unpaid). The permission needed is the one
   * for the stage being left, and the user/time recorded for that stage is cleared.
   */
  async revertPayment(employee: JwtPayload, id: number) {
    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);

    const current = voucher.payment_status as VoucherPaymentStatus | null;
    const leavingPaid = current === VoucherPaymentStatus.PAID;
    const leavingUploaded = current === VoucherPaymentStatus.UPLOADED_FOR_PAYMENT;

    const allowed = await this.hasRoleOrPermission(
      employee,
      [FINANCE_EXECUTIVE],
      leavingPaid ? PERMISSIONS.VOUCHERS_MARK_PAID : PERMISSIONS.VOUCHERS_BANK_UPLOAD,
      'write',
    );
    if (!allowed) {
      throw new ForbiddenException(
        leavingPaid ? VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_MARK_PAID : VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_BANK_UPLOAD,
      );
    }
    if (voucher.status !== VoucherStatus.APPROVED || (!leavingPaid && !leavingUploaded)) {
      throw new BadRequestException(VOUCHER_ERRORS.NOTHING_TO_REVERT);
    }

    const applied = await PaymentVoucherModel.transition(
      id,
      { status: VoucherStatus.APPROVED, payment_status: current! },
      leavingPaid
        ? { payment_status: VoucherPaymentStatus.UPLOADED_FOR_PAYMENT, paid_by: null, paid_at: null }
        : { payment_status: VoucherPaymentStatus.UNPAID, bank_upload_by: null, bank_upload_at: null },
    );
    if (!applied) {
      // Someone else moved it between our read and write.
      throw new BadRequestException(VOUCHER_ERRORS.NOTHING_TO_REVERT);
    }
    return PaymentVoucherModel.findById(id);
  }

  /**
   * Excel export of every approved voucher that has not been paid yet (payment
   * status Unpaid or Uploaded for Payment), oldest first, with a totals row.
   * Needs the same access as the voucher list.
   */
  async buildApprovedUnpaidWorkbook(employee: JwtPayload): Promise<ExcelJS.Workbook> {
    const canView = await this.hasRoleOrPermission(employee, [FINANCE_MANAGER, FINANCE_EXECUTIVE], PERMISSIONS.VOUCHERS_VIEW);
    if (!canView) {
      throw new ForbiddenException('Forbidden');
    }

    const notPaid: string[] = [VoucherPaymentStatus.UNPAID, VoucherPaymentStatus.UPLOADED_FOR_PAYMENT];
    const rows = (await PaymentVoucherModel.getAll({ status: VoucherStatus.APPROVED }))
      .filter((v) => notPaid.includes(v.payment_status))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const name = (v: any, key: string) => `${v[`${key}_first_name`] ?? ''} ${v[`${key}_last_name`] ?? ''}`.trim();
    const pad = (n: number) => String(n).padStart(2, '0');
    const when = (value: Date | string | null | undefined) => {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const paymentLabel = (status: string) =>
      status === VoucherPaymentStatus.UPLOADED_FOR_PAYMENT ? 'Uploaded for Payment' : 'Unpaid';

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Approved - Not Paid');
    sheet.columns = [
      { header: 'Voucher No', key: 'voucher_number', width: 18 },
      { header: 'Service Provider', key: 'provider', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Amount (LKR)', key: 'amount', width: 16 },
      { header: 'VAT (LKR)', key: 'vat', width: 14 },
      { header: 'Payment Status', key: 'payment_status', width: 20 },
      { header: 'Created By', key: 'created_by', width: 24 },
      { header: 'Created At', key: 'created_at', width: 18 },
      { header: 'Manager Approved By', key: 'manager', width: 24 },
      { header: 'Admin Approved By', key: 'admin', width: 24 },
      { header: 'Admin Approved At', key: 'admin_at', width: 18 },
      { header: 'Uploaded for Payment By', key: 'uploaded_by', width: 24 },
      { header: 'Uploaded for Payment At', key: 'uploaded_at', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    let totalAmount = 0;
    let totalVat = 0;
    for (const v of rows) {
      const amount = Number(v.amount) || 0;
      const vat = Number(v.vat) || 0;
      totalAmount += amount;
      totalVat += vat;
      sheet.addRow({
        voucher_number: v.voucher_number,
        provider: v.sp_company_name ?? '',
        description: v.description ?? '',
        amount,
        vat,
        payment_status: paymentLabel(v.payment_status),
        created_by: name(v, 'created_by'),
        created_at: when(v.created_at),
        manager: name(v, 'manager_reviewed_by'),
        admin: name(v, 'admin_reviewed_by'),
        admin_at: when(v.admin_reviewed_at),
        uploaded_by: name(v, 'bank_upload_by'),
        uploaded_at: when(v.bank_upload_at),
      });
    }
    sheet.getColumn('amount').numFmt = '#,##0.00';
    sheet.getColumn('vat').numFmt = '#,##0.00';

    const totals = sheet.addRow({ voucher_number: 'Total', amount: totalAmount, vat: totalVat });
    totals.font = { bold: true };
    return workbook;
  }
}
