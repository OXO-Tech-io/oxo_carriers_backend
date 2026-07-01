import pool from '../config/database';
import { LeaveRequest, LeaveStatus, LeaveBalance, LeaveType } from '../types';
import { calculateProRatedAnnualLeave } from '../utils/leaveCalculation';

export class LeaveModel {
  static async createRequest(request: {
    employee_id: string;
    leave_type_id: number;
    start_date: Date;
    end_date: Date;
    total_days: number;
    is_half_day?: boolean;
    half_day_period?: 'morning' | 'evening';
    reason?: string;
    attachment_url?: string;
  }): Promise<LeaveRequest> {
    const result = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, is_half_day, half_day_period, reason, attachment_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING id`,
      [
        request.employee_id,
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

    const newId = (result.rows[0] as any).id;
    const createdRequest = await this.findById(newId);
    if (!createdRequest) {
      throw new Error('Failed to create leave request');
    }
    return createdRequest;
  }

  static async findById(id: number): Promise<LeaveRequest | null> {
    const result = await pool.query(
      `SELECT lr.*,
              lt.id as leave_type_id_full, lt.name as leave_type_name, lt.description as leave_type_description,
              lt.max_days as leave_type_max_days, lt.is_active as leave_type_is_active, lt.created_at as leave_type_created_at,
              u.id as user_id_full, u.first_name, u.last_name, u.email, u.employee_id
       FROM leave_requests lr
       LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN users u ON lr.employee_id = u.employee_id
       WHERE lr.id = $1`,
      [id]
    );
    const rowsArray = result.rows as any[];
    if (rowsArray.length === 0) return null;

    const row = rowsArray[0];
    return {
      id: row.id,
      employee_id: row.employee_id,
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

  static async findByEmployeeId(employeeId: string, filters?: {
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
      LEFT JOIN users u ON lr.employee_id = u.employee_id
      WHERE lr.employee_id = $1
    `;
    const params: any[] = [employeeId];

    if (filters?.status) {
      params.push(filters.status);
      query += ` AND lr.status = $${params.length}`;
    }

    if (filters?.year) {
      params.push(filters.year);
      query += ` AND EXTRACT(YEAR FROM lr.start_date) = $${params.length}`;
    }

    query += ' ORDER BY lr.created_at DESC';

    const result = await pool.query(query, params);
    return (result.rows as any[]).map((row: any) => ({
      id: row.id,
      employee_id: row.employee_id,
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
    employeeId?: string;
    year?: number;
  }): Promise<LeaveRequest[]> {
    let query = `
      SELECT lr.*,
             lt.id as leave_type_id_full, lt.name as leave_type_name, lt.description as leave_type_description,
             lt.max_days as leave_type_max_days, lt.is_active as leave_type_is_active, lt.created_at as leave_type_created_at,
             u.id as user_id_full, u.first_name, u.last_name, u.email, u.employee_id, u.department
      FROM leave_requests lr
      LEFT JOIN users u ON lr.employee_id = u.employee_id
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.status) {
      params.push(filters.status);
      query += ` AND lr.status = $${params.length}`;
    }

    if (filters?.department) {
      params.push(filters.department);
      query += ` AND u.department = $${params.length}`;
    }

    if (filters?.employeeId) {
      params.push(filters.employeeId);
      query += ` AND lr.employee_id = $${params.length}`;
    }

    if (filters?.year) {
      params.push(filters.year);
      query += ` AND EXTRACT(YEAR FROM lr.start_date) = $${params.length}`;
    }

    query += ' ORDER BY lr.created_at DESC';

    const result = await pool.query(query, params);
    return (result.rows as any[]).map((row: any) => ({
      id: row.id,
      employee_id: row.employee_id,
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
    const params: any[] = [status];
    const updateFields: string[] = [`status = $${params.length}`];

    if (approvedBy === 'team_leader' && status === LeaveStatus.TEAM_LEADER_APPROVED) {
      updateFields.push('team_leader_approval_date = NOW()');
    }

    if (approvedBy === 'hr' && status === LeaveStatus.HR_APPROVED) {
      updateFields.push('hr_approval_date = NOW()');
    }

    if (rejectionReason) {
      params.push(rejectionReason);
      updateFields.push(`rejection_reason = $${params.length}`);
    }

    params.push(id);

    await pool.query(
      `UPDATE leave_requests SET ${updateFields.join(', ')} WHERE id = $${params.length}`,
      params
    );

    // If HR approved, deduct from balance
    if (status === LeaveStatus.HR_APPROVED) {
      const request = await this.findById(id);
      if (request) {
        await this.deductLeaveBalance(request.employee_id, request.leave_type_id, request.total_days);
      }
    }

    return await this.findById(id);
  }

  static async deductLeaveBalance(employeeId: string, leaveTypeId: number, days: number): Promise<void> {
    const currentYear = new Date().getFullYear();
    await pool.query(
      `UPDATE employee_leave_balance
       SET used_days = used_days + $1,
           remaining_days = total_days - (used_days + $2)
       WHERE employee_id = $3 AND leave_type_id = $4 AND year = $5`,
      [days, days, employeeId, leaveTypeId, currentYear]
    );
  }

  static async getLeaveBalance(employeeId: string, year?: number): Promise<LeaveBalance[]> {
    const currentYear = year || new Date().getFullYear();

    try {
      // Get all active leave types
      const leaveTypesRes = await pool.query(
        'SELECT id, name, max_days FROM leave_types WHERE is_active = true'
      );
      const activeLeaveTypes = leaveTypesRes.rows as any[];

      // Fetch user details to get hire date (needed for pro-rated leave calculation)
      const userRes = await pool.query('SELECT hire_date FROM users WHERE employee_id = $1', [employeeId]);
      const user = userRes.rows[0];
      const hireDate = user?.hire_date ? new Date(user.hire_date) : new Date();

      // For each active leave type, ensure the user has a balance record
      for (const type of activeLeaveTypes) {
        const balanceCheck = await pool.query(
          'SELECT 1 FROM employee_leave_balance WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3',
          [employeeId, type.id, currentYear]
        );
        if (balanceCheck.rows.length === 0) {
          let totalDays = type.max_days;
          if (
            type.name.toLowerCase() === 'annual' ||
            type.name.toLowerCase() === 'annual/paid leave' ||
            type.name.toLowerCase() === 'annual leave'
          ) {
            totalDays = calculateProRatedAnnualLeave(hireDate, currentYear);
          }
          await pool.query(
            `INSERT INTO employee_leave_balance (employee_id, leave_type_id, total_days, used_days, remaining_days, year)
             VALUES ($1, $2, $3, 0, $3, $4)`,
            [employeeId, type.id, totalDays, currentYear]
          );
        }
      }
    } catch (err) {
      console.error('Failed to auto-initialize leave balances in getLeaveBalance:', err);
    }

    const result = await pool.query(
      `SELECT elb.*,
              lt.id as lt_id, lt.name, lt.description, lt.max_days, lt.is_active,
              (elb.total_days - elb.used_days) as calculated_remaining_days
       FROM employee_leave_balance elb
       JOIN leave_types lt ON elb.leave_type_id = lt.id
       WHERE elb.employee_id = $1 AND elb.year = $2
       ORDER BY lt.name`,
      [employeeId, currentYear]
    );

    // Transform the flat structure to nested structure
    const balances = (result.rows as any[]).map((row: any) => {
      // Use calculated remaining_days (always accurate)
      const remainingDays = row.calculated_remaining_days !== null && row.calculated_remaining_days !== undefined
        ? row.calculated_remaining_days
        : (row.total_days - row.used_days);

      return {
        id: row.id,
        employee_id: row.employee_id,
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
    const result = await pool.query('SELECT * FROM leave_types WHERE is_active = true ORDER BY name');
    return result.rows as LeaveType[];
  }
}
