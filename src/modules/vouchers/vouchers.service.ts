import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentVoucherModel } from './PaymentVoucher';
import { VendorModel } from '../vendors/Vendor';
import { JwtPayload, UserRole, VoucherStatus } from '../../types';
import { hasPermission } from '../../middleware/permissions';
import { AccessLevel, PERMISSIONS, PermissionKey } from '../../common/constants/permissions';
import { VOUCHER_ERRORS } from '../../common/constants/errorMessages';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { ReviewVoucherDto } from './dto/review-voucher.dto';

const FINANCE_MANAGER = UserRole.FINANCE_MANAGER;
const FINANCE_EXECUTIVE = UserRole.FINANCE_EXECUTIVE;

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

  async create(employee: JwtPayload, dto: CreateVoucherDto, file: Express.Multer.File | undefined) {
    const canCreate = await this.hasRoleOrPermission(employee, [FINANCE_MANAGER], PERMISSIONS.VOUCHERS_CREATE, 'write');
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
    return PaymentVoucherModel.create({
      created_by: Number(created_by),
      vendor_id: vid,
      amount: amountNum,
      vat: vatNum,
      description: description || null,
      invoice_url,
    });
  }

  async getAll(employee: JwtPayload, status?: VoucherStatus) {
    const canView = await this.hasRoleOrPermission(employee, [FINANCE_MANAGER, FINANCE_EXECUTIVE], PERMISSIONS.VOUCHERS_VIEW);
    if (!canView) {
      throw new ForbiddenException('Forbidden');
    }
    return PaymentVoucherModel.getAll({ status });
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

  /** Finance Executive: approve | reject | information_request + optional comment. */
  async review(employee: JwtPayload, id: number, dto: ReviewVoucherDto) {
    const canReview = await this.hasRoleOrPermission(employee, [FINANCE_EXECUTIVE], PERMISSIONS.VOUCHERS_REVIEW, 'write');
    if (!canReview) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_REVIEW);
    }
    const { action, comment } = dto;
    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);
    if (voucher.status !== VoucherStatus.PENDING_REVIEW) {
      throw new BadRequestException(VOUCHER_ERRORS.NOT_PENDING_REVIEW);
    }
    let newStatus: VoucherStatus;
    if (action === 'approve') newStatus = VoucherStatus.APPROVED;
    else if (action === 'reject') newStatus = VoucherStatus.REJECTED;
    else if (action === 'information_request') newStatus = VoucherStatus.INFORMATION_REQUEST;
    else throw new BadRequestException(VOUCHER_ERRORS.INVALID_ACTION);

    await PaymentVoucherModel.updateStatus(id, newStatus, {
      reviewed_by: employee.userId,
      reviewed_at: new Date(),
      executive_comment: comment ?? null,
    });
    return PaymentVoucherModel.findById(id);
  }

  /** Finance Manager: resubmit after information_request. */
  async resubmit(employee: JwtPayload, id: number) {
    const canResubmit = await this.hasRoleOrPermission(employee, [FINANCE_MANAGER], PERMISSIONS.VOUCHERS_RESUBMIT, 'write');
    if (!canResubmit) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_RESUBMIT);
    }
    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);
    if (voucher.status !== VoucherStatus.INFORMATION_REQUEST) {
      throw new BadRequestException(VOUCHER_ERRORS.ONLY_INFORMATION_REQUEST_CAN_RESUBMIT);
    }
    await PaymentVoucherModel.updateStatus(id, VoucherStatus.PENDING_REVIEW, {
      resubmitted_at: new Date(),
      executive_comment: null,
    });
    return PaymentVoucherModel.findById(id);
  }

  /** Finance Manager: mark bank upload done. */
  async bankUpload(employee: JwtPayload, id: number) {
    const canBankUpload = await this.hasRoleOrPermission(employee, [FINANCE_MANAGER], PERMISSIONS.VOUCHERS_BANK_UPLOAD, 'write');
    if (!canBankUpload) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_BANK_UPLOAD);
    }
    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);
    if (voucher.status !== VoucherStatus.APPROVED) {
      throw new BadRequestException(VOUCHER_ERRORS.ONLY_APPROVED_CAN_BANK_UPLOAD);
    }
    await PaymentVoucherModel.updateStatus(id, VoucherStatus.BANK_UPLOAD, {
      bank_upload_by: employee.userId,
      bank_upload_at: new Date(),
    });
    return PaymentVoucherModel.findById(id);
  }

  /** Mark a voucher as paid. */
  async markPaid(employee: JwtPayload, id: number) {
    const canMarkPaid = await this.hasRoleOrPermission(employee, [], PERMISSIONS.VOUCHERS_MARK_PAID, 'write');
    if (!canMarkPaid) {
      throw new ForbiddenException(VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_MARK_PAID);
    }
    const voucher = await PaymentVoucherModel.findById(id);
    if (!voucher) throw new NotFoundException(VOUCHER_ERRORS.NOT_FOUND);
    if (voucher.status !== VoucherStatus.BANK_UPLOAD) {
      throw new BadRequestException(VOUCHER_ERRORS.ONLY_BANK_UPLOAD_CAN_MARK_PAID);
    }
    await PaymentVoucherModel.updateStatus(id, VoucherStatus.PAID, {
      paid_by: employee.userId,
      paid_at: new Date(),
    });
    return PaymentVoucherModel.findById(id);
  }
}
