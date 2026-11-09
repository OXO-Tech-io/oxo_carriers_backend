import pool from '../../config/database';
import { PaymentVoucher, VoucherPaymentStatus, VoucherStatus } from '../../types';
import { EmployeeModel } from '../../employees/Employee';

/** Actor-tracking columns on tbl_payment_vouchers. They are numeric
 * tbl_employee.id FKs (not converted to employee_id). first_name/last_name are
 * encrypted, so they can't be selected directly off a join; resolve them via
 * EmployeeModel.findByIds instead. Each key becomes `<key>_first_name` /
 * `<key>_last_name` on the returned row. */
const ACTOR_COLUMNS = [
  'created_by',
  'manager_reviewed_by',
  'admin_reviewed_by',
  'rejected_by',
  'bank_upload_by',
  'paid_by',
] as const;

async function withActorNames(rows: any[]): Promise<any[]> {
  const ids = rows
    .flatMap(r => ACTOR_COLUMNS.map(col => r[col]))
    .filter((id): id is number => typeof id === 'number');
  const employees = await EmployeeModel.findByIds([...new Set(ids)]);
  const byId = new Map(employees.map(e => [e.id, e]));
  return rows.map(row => {
    const names: Record<string, string | undefined> = {};
    for (const col of ACTOR_COLUMNS) {
      const actor = byId.get(row[col]);
      names[`${col}_first_name`] = actor?.firstName;
      names[`${col}_last_name`] = actor?.lastName;
    }
    return { ...row, ...names };
  });
}

/** Columns a workflow transition may write. A whitelist, because the keys end
 * up in the SQL text of `transition` below. */
const TRANSITION_COLUMNS = [
  'status',
  'payment_status',
  'manager_reviewed_by',
  'manager_reviewed_at',
  'admin_reviewed_by',
  'admin_reviewed_at',
  'rejection_reason',
  'rejected_by',
  'rejected_at',
  'bank_upload_by',
  'bank_upload_at',
  'paid_by',
  'paid_at',
] as const;

export type VoucherTransitionColumns = Partial<Record<(typeof TRANSITION_COLUMNS)[number], string | number | Date | null>>;

export class PaymentVoucherModel {
  static async generateVoucherNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM tbl_payment_vouchers WHERE voucher_number LIKE $1',
      [`VOU-${year}-%`]
    );
    const rows = result.rows as any[];
    const count = Number(rows[0].count);
    const sequence = String(count + 1).padStart(4, '0');
    return `VOU-${year}-${sequence}`;
  }

  static async create(data: {
    created_by: number;
    created_by_role: string;
    initial_status: VoucherStatus;
    vendor_id: number;
    amount: number;
    vat: number;
    description?: string | null;
    invoice_url?: string | null;
  }): Promise<PaymentVoucher> {
    const voucherNumber = await this.generateVoucherNumber();
    const result = await pool.query(
      `INSERT INTO tbl_payment_vouchers (voucher_number, created_by, created_by_role, vendor_id, amount, vat, description, invoice_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        voucherNumber,
        data.created_by,
        data.created_by_role,
        data.vendor_id,
        data.amount,
        data.vat ?? 0,
        data.description ?? null,
        data.invoice_url ?? null,
        data.initial_status,
      ]
    );
    const newId = (result.rows[0] as any).id;
    const voucher = await this.findById(newId);
    if (!voucher) throw new Error('Failed to create voucher');
    return voucher;
  }

  static async findById(id: number): Promise<any | null> {
    const result = await pool.query(
      `SELECT pv.*,
        v.company_name AS sp_company_name, v.email AS sp_email
      FROM tbl_payment_vouchers pv
      LEFT JOIN tbl_vendors v ON pv.vendor_id = v.id
      WHERE pv.id = $1`,
      [id]
    );
    const list = result.rows as any[];
    if (list.length === 0) return null;
    return (await withActorNames(list))[0];
  }

  static async getAll(filters?: { status?: VoucherStatus; payment_status?: VoucherPaymentStatus }): Promise<any[]> {
    let query = `
      SELECT pv.*,
        v.company_name AS sp_company_name
      FROM tbl_payment_vouchers pv
      LEFT JOIN tbl_vendors v ON pv.vendor_id = v.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND pv.status = $${params.length}`;
    }
    if (filters?.payment_status) {
      params.push(filters.payment_status);
      query += ` AND pv.payment_status = $${params.length}`;
    }
    query += ' ORDER BY pv.created_at DESC';
    const result = await pool.query(query, params);
    return withActorNames(result.rows as any[]);
  }

  /**
   * Compare-and-set a workflow transition: applies `set` only while the row is
   * still in the `expected` state, so two reviewers acting at once cannot both
   * succeed. Returns false when the row was not in that state (or is gone).
   */
  static async transition(
    id: number,
    expected: { status: VoucherStatus; payment_status?: VoucherPaymentStatus },
    set: VoucherTransitionColumns,
  ): Promise<boolean> {
    const values: any[] = [];
    const updates: string[] = [];
    for (const col of TRANSITION_COLUMNS) {
      if (set[col] !== undefined) {
        values.push(set[col]);
        updates.push(`${col} = $${values.length}`);
      }
    }
    if (updates.length === 0) throw new Error('transition requires at least one column to set');

    values.push(id);
    let where = `id = $${values.length}`;
    values.push(expected.status);
    where += ` AND status = $${values.length}`;
    if (expected.payment_status) {
      values.push(expected.payment_status);
      where += ` AND payment_status = $${values.length}`;
    }
    const result = await pool.query(
      `UPDATE tbl_payment_vouchers SET ${updates.join(', ')} WHERE ${where}`,
      values
    );
    return (result.rowCount ?? 0) > 0;
  }
}
