import pool from '../config/database';
import { PaymentVoucher, VoucherStatus } from '../types';

export class PaymentVoucherModel {
  static async generateVoucherNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as count FROM payment_vouchers WHERE voucher_number LIKE ?',
      [`VOU-${year}-%`]
    );
    const result = rows as any[];
    const count = result[0].count;
    const sequence = String(count + 1).padStart(4, '0');
    return `VOU-${year}-${sequence}`;
  }

  static async create(data: {
    created_by: number;
    vendor_id: number;
    amount: number;
    vat: number;
    description?: string | null;
    invoice_url?: string | null;
  }): Promise<PaymentVoucher> {
    const voucherNumber = await this.generateVoucherNumber();
    const [result] = await pool.execute(
      `INSERT INTO payment_vouchers (voucher_number, created_by, vendor_id, amount, vat, description, invoice_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucherNumber,
        data.created_by,
        data.vendor_id,
        data.amount,
        data.vat ?? 0,
        data.description ?? null,
        data.invoice_url ?? null,
        VoucherStatus.PENDING_REVIEW
      ]
    );
    const insertResult = result as any;
    const voucher = await this.findById(insertResult.insertId);
    if (!voucher) throw new Error('Failed to create voucher');
    return voucher;
  }

  static async findById(id: number): Promise<any | null> {
    const [rows] = await pool.execute(
      `SELECT pv.id, pv.voucher_number, pv.created_by, pv.vendor_id, pv.amount, pv.vat, pv.description, pv.invoice_url, pv.status, pv.executive_comment, pv.reviewed_by, pv.reviewed_at, pv.resubmitted_at, pv.bank_upload_by, pv.bank_upload_at, pv.paid_by, pv.paid_at, pv.created_at, pv.updated_at,
        creator.first_name AS created_by_first_name, creator.last_name AS created_by_last_name,
        v.company_name AS sp_company_name, v.email AS sp_email,
        reviewer.first_name AS reviewed_by_first_name, reviewer.last_name AS reviewed_by_last_name
      FROM payment_vouchers pv
      LEFT JOIN users creator ON pv.created_by = creator.id
      LEFT JOIN vendors v ON pv.vendor_id = v.id
      LEFT JOIN users reviewer ON pv.reviewed_by = reviewer.id
      WHERE pv.id = ?`,
      [id]
    );
    const list = rows as any[];
    return list[0] || null;
  }

  static async getAll(filters?: { status?: VoucherStatus }): Promise<any[]> {
    let query = `
      SELECT pv.*,
        creator.first_name AS created_by_first_name, creator.last_name AS created_by_last_name,
        v.company_name AS sp_company_name
      FROM payment_vouchers pv
      LEFT JOIN users creator ON pv.created_by = creator.id
      LEFT JOIN vendors v ON pv.vendor_id = v.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status) {
      query += ' AND pv.status = ?';
      params.push(filters.status);
    }
    query += ' ORDER BY pv.created_at DESC';
    const [rows] = await pool.execute(query, params);
    return rows as any[];
  }

  static async updateStatus(
    id: number,
    status: VoucherStatus,
    extra: {
      reviewed_by?: number;
      reviewed_at?: Date;
      executive_comment?: string | null;
      resubmitted_at?: Date;
      bank_upload_by?: number;
      bank_upload_at?: Date;
      paid_by?: number;
      paid_at?: Date;
    } = {}
  ): Promise<void> {
    const updates: string[] = ['status = ?'];
    const values: any[] = [status];
    if (extra.reviewed_by !== undefined) {
      updates.push('reviewed_by = ?');
      values.push(extra.reviewed_by);
    }
    if (extra.reviewed_at !== undefined) {
      updates.push('reviewed_at = ?');
      values.push(extra.reviewed_at);
    }
    if (extra.executive_comment !== undefined) {
      updates.push('executive_comment = ?');
      values.push(extra.executive_comment);
    }
    if (extra.resubmitted_at !== undefined) {
      updates.push('resubmitted_at = ?');
      values.push(extra.resubmitted_at);
    }
    if (extra.bank_upload_by !== undefined) {
      updates.push('bank_upload_by = ?');
      values.push(extra.bank_upload_by);
    }
    if (extra.bank_upload_at !== undefined) {
      updates.push('bank_upload_at = ?');
      values.push(extra.bank_upload_at);
    }
    if (extra.paid_by !== undefined) {
      updates.push('paid_by = ?');
      values.push(extra.paid_by);
    }
    if (extra.paid_at !== undefined) {
      updates.push('paid_at = ?');
      values.push(extra.paid_at);
    }
    values.push(id);
    await pool.execute(
      `UPDATE payment_vouchers SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }
}
