import pool from '../config/database';
import { ConsultantWorkSubmission as CWS, ConsultantSubmissionStatus } from '../types';
import { decryptPII } from '../utils/encryption';
import { EmployeeModel } from './Employee';

// drizzle/0009_tbl_prefix_and_employee_type.sql renamed consultant_work_submissions
// -> tbl_consultant_work_submissions and users -> tbl_employee, and swapped this
// table's FK from a numeric user_id to a business employee_id (varchar, FK to
// tbl_employee.employee_id) - user_id no longer exists as a column. To avoid
// rippling that change through the controller/types/frontend (which all deal
// in numeric user ids), every query here still accepts/returns numeric
// user_id, resolving to/from employee_id internally via the tbl_employee join.
export class ConsultantWorkSubmissionModel {
  static async create(data: {
    employee_id: string;
    project: string;
    tech: string;
    total_hours: number;
    comment?: string | null;
    log_sheet_url: string;
    resubmission_of?: number | null;
  }): Promise<CWS> {
    const result = await pool.query(
      `INSERT INTO tbl_consultant_work_submissions (employee_id, project, tech, total_hours, comment, log_sheet_url, resubmission_of, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
      [
        data.employee_id,
        data.project,
        data.tech,
        data.total_hours,
        data.comment ?? null,
        data.log_sheet_url,
        data.resubmission_of ?? null
      ]
    );
    const newId = (result.rows[0] as any).id;
    const created = await this.findById(newId);
    if (!created) throw new Error('Failed to create consultant work submission');
    return created;
  }

  static async findById(id: number): Promise<CWS | null> {
    const result = await pool.query(
      `SELECT c.*, u.id AS employee_pk, u.hourly_rate
       FROM tbl_consultant_work_submissions c
       LEFT JOIN tbl_employee u ON c.employee_id = u.employee_id
       WHERE c.id = $1`,
      [id]
    );
    const rowsArray = result.rows as any[];
    if (rowsArray.length === 0) return null;
    return (await this.mapRows(rowsArray))[0];
  }

  static async findByEmployeeId(employeeId: string, filters?: { status?: ConsultantSubmissionStatus }): Promise<CWS[]> {
    let query = `
      SELECT c.*, u.id AS employee_pk, u.hourly_rate
      FROM tbl_consultant_work_submissions c
      LEFT JOIN tbl_employee u ON c.employee_id = u.employee_id
      WHERE c.employee_id = $1
    `;
    const params: any[] = [employeeId];
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND c.status = $${params.length}`;
    }
    query += ' ORDER BY c.created_at DESC';
    const result = await pool.query(query, params);
    return this.mapRows(result.rows as any[]);
  }

  static async getAll(filters?: { status?: ConsultantSubmissionStatus }): Promise<CWS[]> {
    let query = `
      SELECT c.*, u.id AS employee_pk, u.hourly_rate
      FROM tbl_consultant_work_submissions c
      LEFT JOIN tbl_employee u ON c.employee_id = u.employee_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND c.status = $${params.length}`;
    }
    query += ' ORDER BY c.created_at DESC';
    const result = await pool.query(query, params);
    return this.mapRows(result.rows as any[]);
  }

  static async updateStatus(
    id: number,
    status: ConsultantSubmissionStatus,
    reviewedBy: number,
    adminComment?: string | null
  ): Promise<CWS | null> {
    await pool.query(
      `UPDATE tbl_consultant_work_submissions SET status = $1, admin_comment = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4`,
      [status, adminComment ?? null, reviewedBy, id]
    );
    return this.findById(id);
  }

  /**
   * Atomically checks the submission is still in `expectedStatus` and applies
   * the new status within a single DB transaction (row-locked), to avoid a
   * TOCTOU race if two reviewers approve/reject the same submission at once.
   * Throws Error('SUBMISSION_NOT_PENDING') if the row isn't in expectedStatus.
   */
  static async updateStatusTransactional(
    id: number,
    expectedStatus: ConsultantSubmissionStatus,
    status: ConsultantSubmissionStatus,
    reviewedBy: number,
    adminComment?: string | null
  ): Promise<CWS | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT status FROM tbl_consultant_work_submissions WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      if (current.rows[0].status !== expectedStatus) {
        await client.query('ROLLBACK');
        throw new Error('SUBMISSION_NOT_PENDING');
      }
      await client.query(
        `UPDATE tbl_consultant_work_submissions SET status = $1, admin_comment = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4`,
        [status, adminComment ?? null, reviewedBy, id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.findById(id);
  }

  private static async mapRows(rows: any[]): Promise<CWS[]> {
    const employeeMap = await EmployeeModel.findByEmployeeIds(rows.map(r => r.employee_id));
    return rows.map(row => {
      const emp = employeeMap.get(row.employee_id);
      return {
        id: row.id,
        employee_id: row.employee_id,
        project: row.project,
        tech: row.tech,
        total_hours: parseFloat(row.total_hours) || row.total_hours,
        comment: row.comment,
        log_sheet_url: row.log_sheet_url,
        status: row.status,
        admin_comment: row.admin_comment,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        resubmission_of: row.resubmission_of,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user: emp
          ? {
              id: row.employee_pk,
              first_name: emp.firstName,
              last_name: emp.lastName,
              email: emp.email,
              employee_id: row.employee_id,
              hourly_rate: row.hourly_rate != null ? parseFloat(decryptPII(row.hourly_rate) || '0') : null
            }
          : undefined,
      };
    });
  }
}
