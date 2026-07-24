import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import pool from '../../config/database';
import { EmployeeModel } from '../../employees/Employee';

@Injectable()
export class ReportsService {
  async getLeaveReportData(filters: { department?: string; year?: string; month?: string; status?: string }) {
    let query = `
      SELECT
        lr.*,
        u.employee_id,
        u.department,
        lt.name as leave_type_name
      FROM tbl_leave_requests lr
      JOIN tbl_employee u ON lr.employee_id = u.employee_id
      JOIN tbl_leave_types lt ON lr.leave_type_id = lt.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.department) {
      params.push(filters.department);
      query += ` AND u.department = $${params.length}`;
    }
    if (filters.year) {
      params.push(filters.year);
      query += ` AND EXTRACT(YEAR FROM lr.start_date) = $${params.length}`;
    }
    if (filters.month) {
      params.push(filters.month);
      query += ` AND EXTRACT(MONTH FROM lr.start_date) = $${params.length}`;
    }
    if (filters.status) {
      params.push(filters.status);
      query += ` AND lr.status = $${params.length}`;
    }
    query += ' ORDER BY lr.created_at DESC';

    const result = await pool.query(query, params);
    return this.withEmployeeNames(result.rows as any[]);
  }

  /** first_name/last_name are encrypted on tbl_employee - batch-resolve and
   * attach the decrypted values instead of selecting them in the join. */
  private async withEmployeeNames(rows: any[]): Promise<any[]> {
    const employeeMap = await EmployeeModel.findByEmployeeIds(rows.map(r => r.employee_id));
    return rows.map(row => {
      const emp = employeeMap.get(row.employee_id);
      return { ...row, first_name: emp?.firstName, last_name: emp?.lastName };
    });
  }

  buildLeaveReportWorkbook(data: any[]) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leave Report');

    worksheet.columns = [
      { header: 'Employee ID', key: 'employee_id', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Leave Type', key: 'leave_type_name', width: 15 },
      { header: 'Start Date', key: 'start_date', width: 15 },
      { header: 'End Date', key: 'end_date', width: 15 },
      { header: 'Total Days', key: 'total_days', width: 12 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20 },
    ];

    data.forEach((row) => {
      worksheet.addRow({
        employee_id: row.employee_id,
        name: `${row.first_name} ${row.last_name}`,
        department: row.department,
        leave_type_name: row.leave_type_name,
        start_date: new Date(row.start_date).toLocaleDateString(),
        end_date: new Date(row.end_date).toLocaleDateString(),
        total_days: row.total_days,
        status: row.status,
        reason: row.reason || '',
        created_at: new Date(row.created_at).toLocaleString(),
      });
    });

    return workbook;
  }

  async getSalaryReportData(filters: { department?: string; year?: string; month?: string }) {
    let query = `
      SELECT
        ms.*,
        u.employee_id,
        u.department
      FROM tbl_monthly_salaries ms
      JOIN tbl_employee u ON ms.employee_id = u.employee_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.department) {
      params.push(filters.department);
      query += ` AND u.department = $${params.length}`;
    }
    if (filters.year) {
      params.push(filters.year);
      query += ` AND EXTRACT(YEAR FROM ms.month_year) = $${params.length}`;
    }
    if (filters.month) {
      params.push(filters.month);
      query += ` AND EXTRACT(MONTH FROM ms.month_year) = $${params.length}`;
    }
    // first_name is encrypted - can't sort in SQL. month_year DESC still
    // works there; the first_name tie-break moves to application code below.
    query += ' ORDER BY ms.month_year DESC';

    const result = await pool.query(query, params);
    const withNames = await this.withEmployeeNames(result.rows as any[]);
    withNames.sort((a, b) => {
      const monthDiff = new Date(b.month_year).getTime() - new Date(a.month_year).getTime();
      return monthDiff !== 0 ? monthDiff : (a.first_name || '').localeCompare(b.first_name || '');
    });
    return withNames;
  }

  buildSalaryReportWorkbook(data: any[]) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Salary Report');

    worksheet.columns = [
      { header: 'Employee ID', key: 'employee_id', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Month', key: 'month_year', width: 15 },
      { header: 'Basic Salary', key: 'basic_salary', width: 15 },
      { header: 'Total Earnings', key: 'total_earnings', width: 15 },
      { header: 'Total Deductions', key: 'total_deductions', width: 15 },
      { header: 'Net Salary', key: 'net_salary', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    data.forEach((row) => {
      worksheet.addRow({
        employee_id: row.employee_id,
        name: `${row.first_name} ${row.last_name}`,
        department: row.department,
        month_year: new Date(row.month_year).toLocaleDateString('default', { month: 'long', year: 'numeric' }),
        basic_salary: parseFloat(row.basic_salary),
        total_earnings: parseFloat(row.total_earnings),
        total_deductions: parseFloat(row.total_deductions),
        net_salary: parseFloat(row.net_salary),
        status: row.status,
      });
    });

    return workbook;
  }

  async getDashboardMetrics() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const employeeCountResult = await pool.query(`SELECT COUNT(*) as count FROM tbl_employee WHERE role = 'employee'`);
    const totalEmployees = Number((employeeCountResult.rows as any[])[0].count);

    const pendingLeavesResult = await pool.query(`SELECT COUNT(*) as count FROM tbl_leave_requests WHERE status = 'pending'`);
    const pendingLeaveRequests = Number((pendingLeavesResult.rows as any[])[0].count);

    const monthLeavesResult = await pool.query(
      `SELECT COUNT(*) as count FROM tbl_leave_requests
       WHERE EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
      [currentMonth, currentYear],
    );
    const leaveRequestsThisMonth = Number((monthLeavesResult.rows as any[])[0].count);

    const monthSalariesResult = await pool.query(
      `SELECT COUNT(*) as count, SUM(net_salary) as total
       FROM tbl_monthly_salaries
       WHERE EXTRACT(MONTH FROM month_year) = $1 AND EXTRACT(YEAR FROM month_year) = $2 AND status = 'paid'`,
      [currentMonth, currentYear],
    );
    const salaryData = (monthSalariesResult.rows as any[])[0];
    const salariesPaidThisMonth = Number(salaryData.count);
    const totalSalaryPaid = parseFloat(salaryData.total || 0);

    const deptLeavesResult = await pool.query(
      `SELECT u.department, COUNT(*) as count
       FROM tbl_leave_requests lr
       JOIN tbl_employee u ON lr.employee_id = u.employee_id
       WHERE EXTRACT(YEAR FROM lr.created_at) = $1
       GROUP BY u.department`,
      [currentYear],
    );

    return {
      totalEmployees,
      pendingLeaveRequests,
      leaveRequestsThisMonth,
      salariesPaidThisMonth,
      totalSalaryPaid,
      departmentLeaveDistribution: deptLeavesResult.rows,
    };
  }
}
