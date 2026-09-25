import fs from 'fs';
import pool from '../../config/database';
import { MedicalInsuranceClaim, MedicalClaimType, MedicalClaimStatus, MedicalClaimPaymentStatus } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { logger } from '../../lib/logger';

const IN_PATIENT_MAX = 300000;
const OPD_QUARTER_MAX = 6000; // 6,000 per quarter; 24,000 per year (6000 * 4)

export function getCurrentQuarter(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const q = Math.ceil(month / 3);
  return `${year}-Q${q}`;
}

export function getMaxAmountForType(type: MedicalClaimType): number {
  return type === MedicalClaimType.IN ? IN_PATIENT_MAX : OPD_QUARTER_MAX;
}

export class MedicalInsuranceModel {
  static async create(claim: {
    employee_id: string;
    type: MedicalClaimType;
    quarter: string;
    amount: number;
    supportive_document_url: string;
    relevant_document_url?: string | null;
    resubmission_of?: number | null;
  }): Promise<MedicalInsuranceClaim> {
    const result = await pool.query(
      `INSERT INTO tbl_medical_insurance_claims (employee_id, type, quarter, amount, supportive_document_url, relevant_document_url, resubmission_of, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
      [
        claim.employee_id,
        claim.type,
        claim.quarter,
        claim.amount,
        claim.supportive_document_url,
        claim.relevant_document_url ?? null,
        claim.resubmission_of ?? null
      ]
    );
    const newId = (result.rows[0] as any).id;
    const created = await this.findById(newId);
    if (!created) throw new Error('Failed to create medical insurance claim');
    return created;
  }

  static async findById(id: number): Promise<MedicalInsuranceClaim | null> {
    const result = await pool.query(
      `SELECT mc.* FROM tbl_medical_insurance_claims mc WHERE mc.id = $1`,
      [id]
    );
    const rowsArray = result.rows as any[];
    if (rowsArray.length === 0) return null;
    return (await this.mapRows(rowsArray))[0];
  }

  static async findByEmployeeId(employeeId: string, filters?: { status?: MedicalClaimStatus }): Promise<MedicalInsuranceClaim[]> {
    let query = `
      SELECT mc.* FROM tbl_medical_insurance_claims mc
      WHERE mc.employee_id = $1
    `;
    const params: any[] = [employeeId];
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND mc.status = $${params.length}`;
    }
    query += ' ORDER BY mc.created_at DESC';
    const result = await pool.query(query, params);
    return this.mapRows(result.rows as any[]);
  }

  static async getAll(filters?: { status?: MedicalClaimStatus; type?: MedicalClaimType }): Promise<MedicalInsuranceClaim[]> {
    let query = `
      SELECT mc.* FROM tbl_medical_insurance_claims mc
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND mc.status = $${params.length}`;
    }
    if (filters?.type) {
      params.push(filters.type);
      query += ` AND mc.type = $${params.length}`;
    }
    query += ' ORDER BY mc.created_at DESC';
    const result = await pool.query(query, params);
    return this.mapRows(result.rows as any[]);
  }

  // OCD-487: the quarterly limit must be enforced against everything that can
  // still turn into a paid claim - Pending (awaiting a decision) as well as
  // Approved - not just Approved, otherwise an employee can queue up several
  // Pending claims that together blow past the limit before any of them are
  // reviewed.
  static async getUsedOPDAmountForQuarter(employeeId: string, quarter: string): Promise<number> {
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM tbl_medical_insurance_claims
       WHERE employee_id = $1 AND quarter = $2 AND type = 'OPD' AND status IN ('pending', 'approved')`,
      [employeeId, quarter]
    );
    const row = (result.rows as any[])[0];
    return parseFloat(row?.total || 0);
  }

  // OCD-486: lets an employee withdraw their own claim while it's still
  // Pending. Cancellation is intentionally its own status/method (not
  // routed through updateStatus) since it isn't an HR/Finance decision -
  // no reviewed_by/admin_comment is recorded.
  static async cancel(id: number): Promise<MedicalInsuranceClaim | null> {
    await pool.query(
      `UPDATE tbl_medical_insurance_claims SET status = 'cancelled' WHERE id = $1`,
      [id]
    );
    return this.findById(id);
  }

  static async updateStatus(
    id: number,
    status: MedicalClaimStatus,
    reviewedBy: number,
    adminComment?: string | null
  ): Promise<MedicalInsuranceClaim | null> {
    await pool.query(
      `UPDATE tbl_medical_insurance_claims SET status = $1, admin_comment = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4`,
      [status, adminComment ?? null, reviewedBy, id]
    );
    return this.findById(id);
  }

  // Ensures the payment-processing columns exist (older databases created
  // before OCD-494 won't have them). Mirrors the self-healing column checks
  // already used elsewhere in this codebase (see Salary.ts).
  private static async ensurePaymentColumns(): Promise<void> {
    try {
      await pool.query(`
        DO $$ BEGIN
          CREATE TYPE "medical_payment_status" AS ENUM ('not_paid', 'partially_paid', 'paid');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await pool.query(`
        ALTER TABLE tbl_medical_insurance_claims
          ADD COLUMN IF NOT EXISTS payment_status medical_payment_status NOT NULL DEFAULT 'not_paid',
          ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2),
          ADD COLUMN IF NOT EXISTS payment_date DATE,
          ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(200),
          ADD COLUMN IF NOT EXISTS paid_by INTEGER REFERENCES tbl_employee(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
      `);
    } catch (error: any) {
      logger.warn({ err: error }, 'Medical claim payment column check/add warning');
    }
  }

  static async recordPayment(
    id: number,
    paymentStatus: MedicalClaimPaymentStatus,
    extra: {
      paid_amount?: number | null;
      payment_date?: Date | null;
      payment_reference?: string | null;
      paid_by: number;
      paid_at: Date;
    }
  ): Promise<MedicalInsuranceClaim | null> {
    await this.ensurePaymentColumns();
    await pool.query(
      `UPDATE tbl_medical_insurance_claims
       SET payment_status = $1, paid_amount = $2, payment_date = $3, payment_reference = $4, paid_by = $5, paid_at = $6
       WHERE id = $7`,
      [
        paymentStatus,
        extra.paid_amount ?? null,
        extra.payment_date ?? null,
        extra.payment_reference ?? null,
        extra.paid_by,
        extra.paid_at,
        id,
      ]
    );
    return this.findById(id);
  }

  private static async ensureDocumentsTable(): Promise<void> {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tbl_medical_insurance_claim_documents (
          filename VARCHAR(255) PRIMARY KEY,
          mime_type VARCHAR(150) NOT NULL,
          data BYTEA NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
    } catch (error: any) {
      logger.warn({ err: error }, 'Medical claim document table check/create warning');
    }
  }

  /**
   * OCD-493: Cloud Run's local disk is ephemeral - files multer writes to
   * uploads/ disappear whenever the container instance recycles (scale to
   * zero, a redeploy, or a request simply landing on a different instance),
   * which is why previously-submitted claim documents 404 later. This
   * mirrors the just-uploaded file into Postgres (already the durable store
   * for everything else here) right after multer saves it to disk, so it
   * survives regardless of instance lifecycle. See main.ts for the read
   * side - it falls back to this table when the on-disk static file is gone.
   */
  static async persistDocumentBlob(file: { filename: string; mimetype: string; path: string }): Promise<void> {
    await this.ensureDocumentsTable();
    const data = fs.readFileSync(file.path);
    await pool.query(
      `INSERT INTO tbl_medical_insurance_claim_documents (filename, mime_type, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (filename) DO NOTHING`,
      [file.filename, file.mimetype, data]
    );
  }

  static async getDocumentBlob(filename: string): Promise<{ mimeType: string; data: Buffer } | null> {
    await this.ensureDocumentsTable();
    const result = await pool.query(
      `SELECT mime_type, data FROM tbl_medical_insurance_claim_documents WHERE filename = $1`,
      [filename]
    );
    const row = (result.rows as any[])[0];
    if (!row) return null;
    return { mimeType: row.mime_type, data: row.data };
  }

  private static async mapRows(rows: any[]): Promise<MedicalInsuranceClaim[]> {
    const employeeMap = await EmployeeModel.findByEmployeeIds(rows.map(r => r.employee_id));
    return rows.map(row => {
      const emp = employeeMap.get(row.employee_id);
      return {
        id: row.id,
        employee_id: row.employee_id,
        type: row.type,
        quarter: row.quarter,
        amount: parseFloat(row.amount) || row.amount,
        status: row.status,
        supportive_document_url: row.supportive_document_url,
        relevant_document_url: row.relevant_document_url,
        admin_comment: row.admin_comment,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        resubmission_of: row.resubmission_of,
        payment_status: row.payment_status ?? MedicalClaimPaymentStatus.NOT_PAID,
        paid_amount: row.paid_amount != null ? parseFloat(row.paid_amount) : null,
        payment_date: row.payment_date,
        payment_reference: row.payment_reference,
        paid_by: row.paid_by,
        paid_at: row.paid_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user: emp
          ? { id: emp.id, first_name: emp.firstName, last_name: emp.lastName, email: emp.email, employee_id: row.employee_id }
          : undefined,
      };
    });
  }
}
