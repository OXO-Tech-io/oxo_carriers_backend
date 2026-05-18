import { Request, Response } from "express";
import { PaymentVoucherModel } from "../models/PaymentVoucher";
import { VendorModel } from "../models/Vendor";
import { AuthRequest, UserRole, VoucherStatus } from "../types";
import { hasPermission } from "../middleware/permissions";
import {
  AccessLevel,
  PERMISSIONS,
  PermissionKey,
} from "../constants/permissions";
import { ERROR_MESSAGES, HTTP_STATUS, VOUCHER_ERRORS } from "../constants/errorMessages";

const FINANCE_MANAGER = UserRole.FINANCE_MANAGER;
const FINANCE_EXECUTIVE = UserRole.FINANCE_EXECUTIVE;

const hasRoleOrPermission = async (
  req: AuthRequest,
  allowedRoles: UserRole[],
  permission: PermissionKey,
  requiredLevel: AccessLevel = "read",
): Promise<boolean> => {
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (!role || !userId) {
    return false;
  }

  if (role === UserRole.SUPER_ADMIN || allowedRoles.includes(role)) {
    return true;
  }

  return hasPermission(userId, permission, requiredLevel);
};

export class VoucherController {
  /** GET /vouchers/service-providers - list vendors (for create voucher dropdown) */
  static async getServiceProviders(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const canView = await hasRoleOrPermission(
        authReq,
        [FINANCE_MANAGER, FINANCE_EXECUTIVE],
        PERMISSIONS.VOUCHERS_VIEW,
      );

      if (!canView) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({ message: ERROR_MESSAGES.FORBIDDEN });
      }
      const vendors = await VendorModel.getAll({});
      res.json(
        vendors.map((v) => ({
          id: v.id,
          company_name: v.company_name,
          email: v.email,
        })),
      );
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const canCreate = await hasRoleOrPermission(
        authReq,
        [FINANCE_MANAGER],
        PERMISSIONS.VOUCHERS_CREATE,
        "write",
      );

      if (!canCreate) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          message: VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_CREATE,
        });
      }
      const { service_provider_id, vendor_id, amount, vat, description } =
        req.body;
      const vid =
        vendor_id != null
          ? parseInt(vendor_id, 10)
          : service_provider_id != null
            ? parseInt(service_provider_id, 10)
            : null;
      const created_by = authReq.user!.userId;
      const file = (req as any).file;
      const invoice_url = file ? `/uploads/documents/${file.filename}` : null;
      if (vid == null || isNaN(vid) || amount == null || amount === "") {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ message: VOUCHER_ERRORS.VENDOR_AND_AMOUNT_REQUIRED });
      }
      const vatNum = vat != null && vat !== "" ? parseFloat(vat) : 0;
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum < 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: VOUCHER_ERRORS.INVALID_AMOUNT });
      }
      const voucher = await PaymentVoucherModel.create({
        created_by: Number(created_by),
        vendor_id: vid,
        amount: amountNum,
        vat: vatNum,
        description: description || null,
        invoice_url,
      });
      res.status(HTTP_STATUS.CREATED).json(voucher);
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }

  static async getAll(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const canView = await hasRoleOrPermission(
        authReq,
        [FINANCE_MANAGER, FINANCE_EXECUTIVE],
        PERMISSIONS.VOUCHERS_VIEW,
      );

      if (!canView) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({ message: ERROR_MESSAGES.FORBIDDEN });
      }
      const status = req.query.status as VoucherStatus | undefined;
      const vouchers = await PaymentVoucherModel.getAll({ status });
      res.json(vouchers);
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const canView = await hasRoleOrPermission(
        authReq,
        [FINANCE_MANAGER, FINANCE_EXECUTIVE],
        PERMISSIONS.VOUCHERS_VIEW,
      );

      if (!canView) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({ message: ERROR_MESSAGES.FORBIDDEN });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher)
        return res.status(HTTP_STATUS.NOT_FOUND).json({ message: VOUCHER_ERRORS.NOT_FOUND });
      res.json(voucher);
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }

  /** Finance Executive: approve | reject | information_request + optional comment */
  static async review(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const canReview = await hasRoleOrPermission(
        authReq,
        [FINANCE_EXECUTIVE],
        PERMISSIONS.VOUCHERS_REVIEW,
        "write",
      );

      if (!canReview) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          message: VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_REVIEW,
        });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const { action, comment } = req.body; // action: 'approve' | 'reject' | 'information_request'
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher)
        return res.status(HTTP_STATUS.NOT_FOUND).json({ message: VOUCHER_ERRORS.NOT_FOUND });
      if (voucher.status !== VoucherStatus.PENDING_REVIEW) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ message: VOUCHER_ERRORS.NOT_PENDING_REVIEW });
      }
      let newStatus: VoucherStatus;
      if (action === "approve") newStatus = VoucherStatus.APPROVED;
      else if (action === "reject") newStatus = VoucherStatus.REJECTED;
      else if (action === "information_request")
        newStatus = VoucherStatus.INFORMATION_REQUEST;
      else return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: VOUCHER_ERRORS.INVALID_ACTION });

      await PaymentVoucherModel.updateStatus(id, newStatus, {
        reviewed_by: authReq.user!.userId,
        reviewed_at: new Date(),
        executive_comment: comment ?? null,
      });
      const updated = await PaymentVoucherModel.findById(id);
      res.json(updated);
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }

  /** Finance Manager: resubmit after information_request */
  static async resubmit(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const canResubmit = await hasRoleOrPermission(
        authReq,
        [FINANCE_MANAGER],
        PERMISSIONS.VOUCHERS_RESUBMIT,
        "write",
      );

      if (!canResubmit) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          message: VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_RESUBMIT,
        });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher)
        return res.status(HTTP_STATUS.NOT_FOUND).json({ message: VOUCHER_ERRORS.NOT_FOUND });
      if (voucher.status !== VoucherStatus.INFORMATION_REQUEST) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: VOUCHER_ERRORS.ONLY_INFORMATION_REQUEST_CAN_RESUBMIT,
        });
      }
      await PaymentVoucherModel.updateStatus(id, VoucherStatus.PENDING_REVIEW, {
        resubmitted_at: new Date(),
        executive_comment: null,
      });
      const updated = await PaymentVoucherModel.findById(id);
      res.json(updated);
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }

  /** Finance Manager: mark bank upload done */
  static async bankUpload(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const canBankUpload = await hasRoleOrPermission(
        authReq,
        [FINANCE_MANAGER],
        PERMISSIONS.VOUCHERS_BANK_UPLOAD,
        "write",
      );

      if (!canBankUpload) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          message: VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_BANK_UPLOAD,
        });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher)
        return res.status(HTTP_STATUS.NOT_FOUND).json({ message: VOUCHER_ERRORS.NOT_FOUND });
      if (voucher.status !== VoucherStatus.APPROVED) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: VOUCHER_ERRORS.ONLY_APPROVED_CAN_BANK_UPLOAD,
        });
      }
      await PaymentVoucherModel.updateStatus(id, VoucherStatus.BANK_UPLOAD, {
        bank_upload_by: authReq.user!.userId,
        bank_upload_at: new Date(),
      });
      const updated = await PaymentVoucherModel.findById(id);
      res.json(updated);
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }

  /** Mark a voucher as paid */
  static async markPaid(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const canMarkPaid = await hasRoleOrPermission(
        authReq,
        [],
        PERMISSIONS.VOUCHERS_MARK_PAID,
        "write",
      );

      if (!canMarkPaid) {
        return res
          .status(HTTP_STATUS.FORBIDDEN)
          .json({ message: VOUCHER_ERRORS.INSUFFICIENT_PERMISSION_MARK_PAID });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher)
        return res.status(HTTP_STATUS.NOT_FOUND).json({ message: VOUCHER_ERRORS.NOT_FOUND });
      if (voucher.status !== VoucherStatus.BANK_UPLOAD) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ message: VOUCHER_ERRORS.ONLY_BANK_UPLOAD_CAN_MARK_PAID });
      }
      await PaymentVoucherModel.updateStatus(id, VoucherStatus.PAID, {
        paid_by: authReq.user!.userId,
        paid_at: new Date(),
      });
      const updated = await PaymentVoucherModel.findById(id);
      res.json(updated);
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
}
