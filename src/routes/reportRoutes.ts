import { Router } from 'express';
import { authenticate, requireHR } from '../middleware/auth';
import pool from '../config/database';
import ExcelJS from 'exceljs';
import { Response } from 'express';

const router = Router();

router.use(authenticate);
router.use(requireHR);

// Leave Reports
router.get('/leaves', async (req, res: Response) => {
  try {
    const { department, year, month, status, format } = req.query;

    let query = `
      SELECT 
        lr.*,
        u.employee_id,
        u.first_name,
        u.last_name,
        u.department,
        lt.name as leave_type_name
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (department) {
      query += ' AND u.department = ?';
      params.push(department);
    }

    if (year) {
      query += ' AND YEAR(lr.start_date) = ?';
      params.push(year);
    }

    if (month) {
      query += ' AND MONTH(lr.start_date) = ?';
      params.push(month);
    }

    if (status) {
      query += ' AND lr.status = ?';
      params.push(status);
    }

    query += ' ORDER BY lr.created_at DESC';

    const [rows] = await pool.execute(query, params);
    const data = rows as any[];

    if (format === 'excel') {
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
        { header: 'Created At', key: 'created_at', width: 20 }
      ];

      data.forEach(row => {
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
          created_at: new Date(row.created_at).toLocaleString()
        });
      });

      const yearMonth = [year, month].filter(Boolean).join('-');
      const filename = `leave-report${yearMonth ? '-' + yearMonth : ''}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.json({ success: true, data, count: data.length });
    }
  } catch (error: any) {
    console.error('Leave report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report', error: error.message });
  }
});

// Salary Reports
router.get('/salaries', async (req, res: Response) => {
  try {
    const { department, year, month, format } = req.query;

    let query = `
      SELECT 
        ms.*,
        u.employee_id,
        u.first_name,
        u.last_name,
        u.department
      FROM monthly_salaries ms
      JOIN users u ON ms.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (department) {
      query += ' AND u.department = ?';
      params.push(department);
    }

    if (year) {
      query += ' AND YEAR(ms.month_year) = ?';
      params.push(year);
    }

    if (month) {
      query += ' AND MONTH(ms.month_year) = ?';
      params.push(month);
    }

    query += ' ORDER BY ms.month_year DESC, u.first_name';

    const [rows] = await pool.execute(query, params);
    const data = rows as any[];

    if (format === 'excel') {
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
        { header: 'Status', key: 'status', width: 12 }
      ];

      data.forEach(row => {
        worksheet.addRow({
          employee_id: row.employee_id,
          name: `${row.first_name} ${row.last_name}`,
          department: row.department,
          month_year: new Date(row.month_year).toLocaleDateString('default', { month: 'long', year: 'numeric' }),
          basic_salary: parseFloat(row.basic_salary),
          total_earnings: parseFloat(row.total_earnings),
          total_deductions: parseFloat(row.total_deductions),
          net_salary: parseFloat(row.net_salary),
          status: row.status
        });
      });

      const yearMonth = [year, month].filter(Boolean).join('-');
      const filename = `salary-report${yearMonth ? '-' + yearMonth : ''}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.json({ success: true, data, count: data.length });
    }
  } catch (error: any) {
    console.error('Salary report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report', error: error.message });
  }
});

// Dashboard Metrics
router.get('/dashboard', async (req, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Total employees
    const [employeeCount] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE role = "employee"');
    const totalEmployees = (employeeCount as any[])[0].count;

    // Pending leave requests
    const [pendingLeaves] = await pool.execute(
      'SELECT COUNT(*) as count FROM leave_requests WHERE status = "pending"'
    );
    const pendingLeaveRequests = (pendingLeaves as any[])[0].count;

    // Leave requests this month
    const [monthLeaves] = await pool.execute(
      'SELECT COUNT(*) as count FROM leave_requests WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?',
      [currentMonth, currentYear]
    );
    const leaveRequestsThisMonth = (monthLeaves as any[])[0].count;

    // Total salaries paid this month
    const [monthSalaries] = await pool.execute(
      `SELECT COUNT(*) as count, SUM(net_salary) as total 
       FROM monthly_salaries 
       WHERE MONTH(month_year) = ? AND YEAR(month_year) = ? AND status = "paid"`,
      [currentMonth, currentYear]
    );
    const salaryData = (monthSalaries as any[])[0];
    const salariesPaidThisMonth = salaryData.count;
    const totalSalaryPaid = parseFloat(salaryData.total || 0);

    // Department-wise leave distribution
    const [deptLeaves] = await pool.execute(
      `SELECT u.department, COUNT(*) as count 
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE YEAR(lr.created_at) = ?
       GROUP BY u.department`,
      [currentYear]
    );

    res.json({
      success: true,
      metrics: {
        totalEmployees,
        pendingLeaveRequests,
        leaveRequestsThisMonth,
        salariesPaidThisMonth,
        totalSalaryPaid,
        departmentLeaveDistribution: deptLeaves
      }
    });
  } catch (error: any) {
    console.error('Dashboard metrics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch metrics', error: error.message });
  }
});

export default router;
