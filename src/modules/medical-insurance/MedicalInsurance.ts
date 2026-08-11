import pool from '../../config/database';
import { MedicalInsuranceClaim, MedicalClaimType, MedicalClaimStatus } from '../../types';
import { EmployeeModel } from '../../employees/Employee';

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

  static async getUsedOPDAmountForQuarter(employeeId: string, quarter: string): Promise<number> {
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM tbl_medical_insurance_claims
       WHERE employee_id = $1 AND quarter = $2 AND type = 'OPD' AND status = 'approved'`,
      [employeeId, quarter]
    );
    const row = (result.rows as any[])[0];
    return parseFloat(row?.total || 0);
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
        created_at: row.created_at,
        updated_at: row.updated_at,
        user: emp
          ? { id: emp.id, first_name: emp.firstName, last_name: emp.lastName, email: emp.email, employee_id: row.employee_id }
          : undefined,
      };
    });
  }
}
