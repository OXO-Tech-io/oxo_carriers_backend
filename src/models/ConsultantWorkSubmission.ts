import pool from '../config/database';
import { ConsultantWorkSubmission as CWS, ConsultantSubmissionStatus } from '../types';

export class ConsultantWorkSubmissionModel {
  static async create(data: {
    user_id: number;
    project: string;
    tech: string;
    total_hours: number;
    comment?: string | null;
    log_sheet_url: string;
    resubmission_of?: number | null;
  }): Promise<CWS> {
    const result = await pool.query(
      `INSERT INTO consultant_work_submissions (user_id, project, tech, total_hours, comment, log_sheet_url, resubmission_of, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
      [
        data.user_id,
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
      `SELECT c.*, u.first_name, u.last_name, u.email, u.employee_id, u.hourly_rate
       FROM consultant_work_submissions c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [id]
    );
    const rowsArray = result.rows as any[];
    if (rowsArray.length === 0) return null;
    return this.mapRow(rowsArray[0]);
  }

  static async findByUserId(userId: number, filters?: { status?: ConsultantSubmissionStatus }): Promise<CWS[]> {
    let query = `
      SELECT c.*, u.first_name, u.last_name, u.email, u.employee_id, u.hourly_rate
      FROM consultant_work_submissions c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.user_id = $1
    `;
    const params: any[] = [userId];
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND c.status = $${params.length}`;
    }
    query += ' ORDER BY c.created_at DESC';
    const result = await pool.query(query, params);
    return (result.rows as any[]).map(this.mapRow);
  }

  static async getAll(filters?: { status?: ConsultantSubmissionStatus }): Promise<CWS[]> {
    let query = `
      SELECT c.*, u.first_name, u.last_name, u.email, u.employee_id, u.hourly_rate
      FROM consultant_work_submissions c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND c.status = $${params.length}`;
    }
    query += ' ORDER BY c.created_at DESC';
    const result = await pool.query(query, params);
    return (result.rows as any[]).map(this.mapRow);
  }

  static async updateStatus(
    id: number,
    status: ConsultantSubmissionStatus,
    reviewedBy: number,
    adminComment?: string | null
  ): Promise<CWS | null> {
    await pool.query(
      `UPDATE consultant_work_submissions SET status = $1, admin_comment = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4`,
      [status, adminComment ?? null, reviewedBy, id]
    );
    return this.findById(id);
  }

  private static mapRow(row: any): CWS {
    return {
      id: row.id,
      user_id: row.user_id,
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
      user: row.first_name
        ? {
            id: row.user_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            employee_id: row.employee_id,
            hourly_rate: row.hourly_rate != null ? parseFloat(row.hourly_rate) : null
          }
        : undefined
    };
  }
}
