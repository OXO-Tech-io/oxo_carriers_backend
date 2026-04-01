import { Request, Response } from 'express';
import { PaymentVoucherModel } from '../models/PaymentVoucher';
import { VendorModel } from '../models/Vendor';
import { AuthRequest, UserRole, VoucherStatus } from '../types';

const FINANCE_MANAGER = UserRole.FINANCE_MANAGER;
const FINANCE_EXECUTIVE = UserRole.FINANCE_EXECUTIVE;
const PAYMENT_APPROVER = UserRole.PAYMENT_APPROVER;

function canAccessVouchers(role: UserRole): boolean {
  return role === FINANCE_MANAGER || role === FINANCE_EXECUTIVE || role === PAYMENT_APPROVER;
}

export class VoucherController {
  /** GET /vouchers/service-providers - list vendors (for create voucher dropdown) */
  static async getServiceProviders(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      if (!canAccessVouchers(authReq.user?.role as UserRole)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const vendors = await VendorModel.getAll({});
      res.json(vendors.map((v) => ({
        id: v.id,
        company_name: v.company_name,
        email: v.email,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      if (authReq.user?.role !== FINANCE_MANAGER) {
        return res.status(403).json({ message: 'Only Finance Manager can create vouchers' });
      }
      const { service_provider_id, vendor_id, amount, vat, description } = req.body;
      const vid = vendor_id != null ? parseInt(vendor_id, 10) : (service_provider_id != null ? parseInt(service_provider_id, 10) : null);
      const created_by = authReq.user.userId;
      const file = (req as any).file;
      const invoice_url = file ? `/uploads/documents/${file.filename}` : null;
      if (vid == null || isNaN(vid) || amount == null || amount === '') {
        return res.status(400).json({ message: 'Vendor and Amount are required' });
      }
      const vatNum = vat != null && vat !== '' ? parseFloat(vat) : 0;
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum < 0) {
        return res.status(400).json({ message: 'Invalid amount' });
      }
      const voucher = await PaymentVoucherModel.create({
        created_by: Number(created_by),
        vendor_id: vid,
        amount: amountNum,
        vat: vatNum,
        description: description || null,
        invoice_url
      });
      res.status(201).json(voucher);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async getAll(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      if (!canAccessVouchers(authReq.user?.role as UserRole)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const status = req.query.status as VoucherStatus | undefined;
      const vouchers = await PaymentVoucherModel.getAll({ status });
      res.json(vouchers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      if (!canAccessVouchers(authReq.user?.role as UserRole)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
      res.json(voucher);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  /** Finance Executive: approve | reject | information_request + optional comment */
  static async review(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      if (authReq.user?.role !== FINANCE_EXECUTIVE) {
        return res.status(403).json({ message: 'Only Finance Executive can review vouchers' });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const { action, comment } = req.body; // action: 'approve' | 'reject' | 'information_request'
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
      if (voucher.status !== VoucherStatus.PENDING_REVIEW) {
        return res.status(400).json({ message: 'Voucher is not pending review' });
      }
      let newStatus: VoucherStatus;
      if (action === 'approve') newStatus = VoucherStatus.APPROVED;
      else if (action === 'reject') newStatus = VoucherStatus.REJECTED;
      else if (action === 'information_request') newStatus = VoucherStatus.INFORMATION_REQUEST;
      else return res.status(400).json({ message: 'Invalid action' });

      await PaymentVoucherModel.updateStatus(id, newStatus, {
        reviewed_by: authReq.user!.userId,
        reviewed_at: new Date(),
        executive_comment: comment ?? null
      });
      const updated = await PaymentVoucherModel.findById(id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  /** Finance Manager: resubmit after information_request */
  static async resubmit(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      if (authReq.user?.role !== FINANCE_MANAGER) {
        return res.status(403).json({ message: 'Only Finance Manager can resubmit vouchers' });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
      if (voucher.status !== VoucherStatus.INFORMATION_REQUEST) {
        return res.status(400).json({ message: 'Only Information Request vouchers can be resubmitted' });
      }
      await PaymentVoucherModel.updateStatus(id, VoucherStatus.PENDING_REVIEW, {
        resubmitted_at: new Date(),
        executive_comment: null
      });
      const updated = await PaymentVoucherModel.findById(id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  /** Finance Manager: mark bank upload done */
  static async bankUpload(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      if (authReq.user?.role !== FINANCE_MANAGER) {
        return res.status(403).json({ message: 'Only Finance Manager can mark bank upload' });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
      if (voucher.status !== VoucherStatus.APPROVED) {
        return res.status(400).json({ message: 'Only Approved vouchers can be marked as Bank Upload' });
      }
      await PaymentVoucherModel.updateStatus(id, VoucherStatus.BANK_UPLOAD, {
        bank_upload_by: authReq.user!.userId,
        bank_upload_at: new Date()
      });
      const updated = await PaymentVoucherModel.findById(id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  /** Payment Approver: mark as paid */
  static async markPaid(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      if (authReq.user?.role !== PAYMENT_APPROVER) {
        return res.status(403).json({ message: 'Only Payment Approver can mark vouchers as Paid' });
      }
      const idParam = req.params.id;
      const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
      const voucher = await PaymentVoucherModel.findById(id);
      if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
      if (voucher.status !== VoucherStatus.BANK_UPLOAD) {
        return res.status(400).json({ message: 'Only Bank Upload vouchers can be marked as Paid' });
      }
      await PaymentVoucherModel.updateStatus(id, VoucherStatus.PAID, {
        paid_by: authReq.user!.userId,
        paid_at: new Date()
      });
      const updated = await PaymentVoucherModel.findById(id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}
