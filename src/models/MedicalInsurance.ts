import pool from '../config/database';
import { MedicalInsuranceClaim, MedicalClaimType, MedicalClaimStatus } from '../types';

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
    user_id: number;
    type: MedicalClaimType;
    quarter: string;
    amount: number;
    supportive_document_url: string;
    relevant_document_url?: string | null;
    resubmission_of?: number | null;
  }): Promise<MedicalInsuranceClaim> {
    const [result] = await pool.execute(
      `INSERT INTO medical_insurance_claims (user_id, type, quarter, amount, supportive_document_url, relevant_document_url, resubmission_of, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        claim.user_id,
        claim.type,
        claim.quarter,
        claim.amount,
        claim.supportive_document_url,
        claim.relevant_document_url ?? null,
        claim.resubmission_of ?? null
      ]
    );
    const insertResult = result as any;
    const created = await this.findById(insertResult.insertId);
    if (!created) throw new Error('Failed to create medical insurance claim');
    return created;
  }

  static async findById(id: number): Promise<MedicalInsuranceClaim | null> {
    const [rows] = await pool.execute(
      `SELECT mc.*, u.first_name, u.last_name, u.email, u.employee_id
       FROM medical_insurance_claims mc
       LEFT JOIN users u ON mc.user_id = u.id
       WHERE mc.id = ?`,
      [id]
    );
    const rowsArray = rows as any[];
    if (rowsArray.length === 0) return null;
    return this.mapRow(rowsArray[0]);
  }

  static async findByUserId(userId: number, filters?: { status?: MedicalClaimStatus }): Promise<MedicalInsuranceClaim[]> {
    let query = `
      SELECT mc.*, u.first_name, u.last_name, u.email, u.employee_id
      FROM medical_insurance_claims mc
      LEFT JOIN users u ON mc.user_id = u.id
      WHERE mc.user_id = ?
    `;
    const params: any[] = [userId];
    if (filters?.status) {
      query += ' AND mc.status = ?';
      params.push(filters.status);
    }
    query += ' ORDER BY mc.created_at DESC';
    const [rows] = await pool.execute(query, params);
    return (rows as any[]).map(this.mapRow);
  }

  static async getAll(filters?: { status?: MedicalClaimStatus; type?: MedicalClaimType }): Promise<MedicalInsuranceClaim[]> {
    let query = `
      SELECT mc.*, u.first_name, u.last_name, u.email, u.employee_id
      FROM medical_insurance_claims mc
      LEFT JOIN users u ON mc.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status) {
      query += ' AND mc.status = ?';
      params.push(filters.status);
    }
    if (filters?.type) {
      query += ' AND mc.type = ?';
      params.push(filters.type);
    }
    query += ' ORDER BY mc.created_at DESC';
    const [rows] = await pool.execute(query, params);
    return (rows as any[]).map(this.mapRow);
  }

  static async getUsedOPDAmountForQuarter(userId: number, quarter: string): Promise<number> {
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM medical_insurance_claims
       WHERE user_id = ? AND quarter = ? AND type = 'OPD' AND status = 'approved'`,
      [userId, quarter]
    );
    const row = (rows as any[])[0];
    return parseFloat(row?.total || 0);
  }

  static async updateStatus(
    id: number,
    status: MedicalClaimStatus,
    reviewedBy: number,
    adminComment?: string | null
  ): Promise<MedicalInsuranceClaim | null> {
    await pool.execute(
      `UPDATE medical_insurance_claims SET status = ?, admin_comment = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [status, adminComment ?? null, reviewedBy, id]
    );
    return this.findById(id);
  }

  private static mapRow(row: any): MedicalInsuranceClaim {
    return {
      id: row.id,
      user_id: row.user_id,
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
      created_at: row.created_at,
      updated_at: row.updated_at,
      user: row.first_name
        ? {
            id: row.user_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            employee_id: row.employee_id
          }
        : undefined
    };
  }
}
