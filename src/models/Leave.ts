import pool from '../config/database';
import { LeaveRequest, LeaveStatus, LeaveBalance, LeaveType } from '../types';

export class LeaveModel {
  static async createRequest(request: {
    user_id: number;
    leave_type_id: number;
    start_date: Date;
    end_date: Date;
    total_days: number;
    is_half_day?: boolean;
    half_day_period?: 'morning' | 'evening';
    reason?: string;
    attachment_url?: string;
  }): Promise<LeaveRequest> {
    const [result] = await pool.execute(
      `INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, total_days, is_half_day, half_day_period, reason, attachment_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        request.user_id,
        request.leave_type_id,
        request.start_date,
        request.end_date,
        request.total_days,
        request.is_half_day || false,
        request.half_day_period || null,
        request.reason || null,
        request.attachment_url || null
      ]
    );

    const insertResult = result as any;
    const createdRequest = await this.findById(insertResult.insertId);
    if (!createdRequest) {
      throw new Error('Failed to create leave request');
    }
    return createdRequest;
  }

  static async findById(id: number): Promise<LeaveRequest | null> {
    const [rows] = await pool.execute(
      `SELECT lr.*, 
              lt.id as leave_type_id_full, lt.name as leave_type_name, lt.description as leave_type_description, 
              lt.max_days as leave_type_max_days, lt.is_active as leave_type_is_active, lt.created_at as leave_type_created_at,
              u.id as user_id_full, u.first_name, u.last_name, u.email, u.employee_id
       FROM leave_requests lr
       LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN users u ON lr.user_id = u.id
       WHERE lr.id = ?`,
      [id]
    );
    const rowsArray = rows as any[];
    if (rowsArray.length === 0) return null;
    
    const row = rowsArray[0];
    return {
      id: row.id,
      user_id: row.user_id,
      leave_type_id: row.leave_type_id,
      start_date: row.start_date,
      end_date: row.end_date,
      total_days: row.total_days,
      reason: row.reason,
      status: row.status,
      team_leader_approval_date: row.team_leader_approval_date,
      hr_approval_date: row.hr_approval_date,
      rejection_reason: row.rejection_reason,
      attachment_url: row.attachment_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      leave_type: row.leave_type_name ? {
        id: row.leave_type_id_full,
        name: row.leave_type_name,
        description: row.leave_type_description || '',
        max_days: row.leave_type_max_days,
        is_active: row.leave_type_is_active,
        created_at: row.leave_type_created_at
      } : undefined,
      user: row.first_name ? {
        id: row.user_id_full,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        employee_id: row.employee_id
      } : undefined
    } as LeaveRequest;
  }

  static async findByUserId(userId: number, filters?: {
    status?: LeaveStatus;
    year?: number;
  }): Promise<LeaveRequest[]> {
    let query = `
      SELECT lr.*, 
             lt.id as leave_type_id_full, lt.name as leave_type_name, lt.description as leave_type_description, 
             lt.max_days as leave_type_max_days, lt.is_active as leave_type_is_active, lt.created_at as leave_type_created_at,
             u.id as user_id_full, u.first_name, u.last_name, u.email, u.employee_id
      FROM leave_requests lr
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN users u ON lr.user_id = u.id
      WHERE lr.user_id = ?
    `;
    const params: any[] = [userId];

    if (filters?.status) {
      query += ' AND lr.status = ?';
      params.push(filters.status);
    }

    if (filters?.year) {
      query += ' AND YEAR(lr.start_date) = ?';
      params.push(filters.year);
    }

    query += ' ORDER BY lr.created_at DESC';

    const [rows] = await pool.execute(query, params);
    return (rows as any[]).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      leave_type_id: row.leave_type_id,
      start_date: row.start_date,
      end_date: row.end_date,
      total_days: parseFloat(row.total_days) || row.total_days,
      is_half_day: row.is_half_day === 1 || row.is_half_day === true,
      half_day_period: row.half_day_period || undefined,
      reason: row.reason,
      status: row.status,
      team_leader_approval_date: row.team_leader_approval_date,
      hr_approval_date: row.hr_approval_date,
      rejection_reason: row.rejection_reason,
      attachment_url: row.attachment_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      leave_type: row.leave_type_name ? {
        id: row.leave_type_id_full,
        name: row.leave_type_name,
        description: row.leave_type_description || '',
        max_days: row.leave_type_max_days,
        is_active: row.leave_type_is_active,
        created_at: row.leave_type_created_at
      } : undefined,
      user: row.first_name ? {
        id: row.user_id_full,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        employee_id: row.employee_id
      } : undefined
    })) as LeaveRequest[];
  }

  static async getAll(filters?: {
    status?: LeaveStatus;
    department?: string;
    userId?: number;
    year?: number;
  }): Promise<LeaveRequest[]> {
    let query = `
      SELECT lr.*, 
             lt.id as leave_type_id_full, lt.name as leave_type_name, lt.description as leave_type_description, 
             lt.max_days as leave_type_max_days, lt.is_active as leave_type_is_active, lt.created_at as leave_type_created_at,
             u.id as user_id_full, u.first_name, u.last_name, u.email, u.employee_id, u.department
      FROM leave_requests lr
      LEFT JOIN users u ON lr.user_id = u.id
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.status) {
      query += ' AND lr.status = ?';
      params.push(filters.status);
    }

    if (filters?.department) {
      query += ' AND u.department = ?';
      params.push(filters.department);
    }

    if (filters?.userId) {
      query += ' AND lr.user_id = ?';
      params.push(filters.userId);
    }

    if (filters?.year) {
      query += ' AND YEAR(lr.start_date) = ?';
      params.push(filters.year);
    }

    query += ' ORDER BY lr.created_at DESC';

    const [rows] = await pool.execute(query, params);
    return (rows as any[]).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      leave_type_id: row.leave_type_id,
      start_date: row.start_date,
      end_date: row.end_date,
      total_days: parseFloat(row.total_days) || row.total_days,
      is_half_day: row.is_half_day === 1 || row.is_half_day === true,
      half_day_period: row.half_day_period || undefined,
      reason: row.reason,
      status: row.status,
      team_leader_approval_date: row.team_leader_approval_date,
      hr_approval_date: row.hr_approval_date,
      rejection_reason: row.rejection_reason,
      attachment_url: row.attachment_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      leave_type: row.leave_type_name ? {
        id: row.leave_type_id_full,
        name: row.leave_type_name,
        description: row.leave_type_description || '',
        max_days: row.leave_type_max_days,
        is_active: row.leave_type_is_active,
        created_at: row.leave_type_created_at
      } : undefined,
      user: row.first_name ? {
        id: row.user_id_full,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        employee_id: row.employee_id
      } : undefined
    })) as LeaveRequest[];
  }

  static async updateStatus(
    id: number,
    status: LeaveStatus,
    approvedBy: 'team_leader' | 'hr',
    rejectionReason?: string
  ): Promise<LeaveRequest | null> {
    const updateFields: string[] = ['status = ?'];
    const params: any[] = [status];

    if (approvedBy === 'team_leader' && status === LeaveStatus.TEAM_LEADER_APPROVED) {
      updateFields.push('team_leader_approval_date = NOW()');
    }

    if (approvedBy === 'hr' && status === LeaveStatus.HR_APPROVED) {
      updateFields.push('hr_approval_date = NOW()');
    }

    if (rejectionReason) {
      updateFields.push('rejection_reason = ?');
      params.push(rejectionReason);
    }

    params.push(id);

    await pool.execute(
      `UPDATE leave_requests SET ${updateFields.join(', ')} WHERE id = ?`,
      params
    );

    // If HR approved, deduct from balance
    if (status === LeaveStatus.HR_APPROVED) {
      const request = await this.findById(id);
      if (request) {
        await this.deductLeaveBalance(request.user_id, request.leave_type_id, request.total_days);
      }
    }

    return await this.findById(id);
  }

  static async deductLeaveBalance(userId: number, leaveTypeId: number, days: number): Promise<void> {
    const currentYear = new Date().getFullYear();
    await pool.execute(
      `UPDATE employee_leave_balance 
       SET used_days = used_days + ?, 
           remaining_days = total_days - (used_days + ?)
       WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
      [days, days, userId, leaveTypeId, currentYear]
    );
  }

  static async getLeaveBalance(userId: number, year?: number): Promise<LeaveBalance[]> {
    const currentYear = year || new Date().getFullYear();
    const [rows] = await pool.execute(
      `SELECT elb.*, 
              lt.id as lt_id, lt.name, lt.description, lt.max_days, lt.is_active,
              (elb.total_days - elb.used_days) as calculated_remaining_days
       FROM employee_leave_balance elb
       JOIN leave_types lt ON elb.leave_type_id = lt.id
       WHERE elb.user_id = ? AND elb.year = ?
       ORDER BY lt.name`,
      [userId, currentYear]
    );
    
    // Transform the flat structure to nested structure
    const balances = (rows as any[]).map((row: any) => {
      // Use calculated remaining_days (always accurate)
      const remainingDays = row.calculated_remaining_days !== null && row.calculated_remaining_days !== undefined
        ? row.calculated_remaining_days
        : (row.total_days - row.used_days);
      
      return {
        id: row.id,
        user_id: row.user_id,
        leave_type_id: row.leave_type_id,
        total_days: parseFloat(row.total_days) || row.total_days,
        used_days: parseFloat(row.used_days) || row.used_days,
        remaining_days: parseFloat(remainingDays) || remainingDays,
        year: row.year,
        leave_type: {
          id: row.lt_id,
          name: row.name,
          description: row.description || '',
          max_days: row.max_days,
          is_active: row.is_active,
          created_at: new Date()
        },
        created_at: row.created_at ? new Date(row.created_at) : new Date(),
        updated_at: row.updated_at ? new Date(row.updated_at) : new Date()
      };
    });
    
    return balances as LeaveBalance[];
  }

  static async getLeaveTypes(): Promise<LeaveType[]> {
    const [rows] = await pool.execute('SELECT * FROM leave_types WHERE is_active = true ORDER BY name');
    return rows as LeaveType[];
  }
}
