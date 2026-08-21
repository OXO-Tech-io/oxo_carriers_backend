import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import pool from '../../config/database';
import { EmployeeModel } from '../../employees/Employee';
import { decryptSalary } from '../../utils/encryption';

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

    // net_salary is PGP-encrypted (varchar ciphertext, see Salary.ts/encryption.ts) -
    // it can't be summed in SQL, so fetch the rows and decrypt+sum in JS.
    const monthSalariesResult = await pool.query(
      `SELECT net_salary
       FROM tbl_monthly_salaries
       WHERE EXTRACT(MONTH FROM month_year) = $1 AND EXTRACT(YEAR FROM month_year) = $2 AND status = 'paid'`,
      [currentMonth, currentYear],
    );
    const paidSalaryRows = monthSalariesResult.rows as any[];
    const salariesPaidThisMonth = paidSalaryRows.length;
    const totalSalaryPaid = paidSalaryRows.reduce(
      (sum, row) => sum + parseFloat(decryptSalary(row.net_salary) || '0'),
      0,
    );

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

  async getSubmissionsBreakdown(filters: {
    department?: string;
    employeeId?: string;
    formId?: number;
    communicationId?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const now = new Date();

    // 1. Fetch Forms Distributions & Responses
    let formsQuery = `
      SELECT 
        fd.id as distribution_id,
        fd.form_id,
        f.title as form_title,
        fd.employee_id,
        u.department,
        fd.distributed_at,
        fs.close_at as deadline_at,
        fr.status as response_status,
        fr.submitted_at,
        fr.completion_ms
      FROM tbl_form_distributions fd
      JOIN tbl_forms f ON fd.form_id = f.id
      LEFT JOIN tbl_form_settings fs ON f.id = fs.form_id
      LEFT JOIN tbl_form_responses fr ON fd.form_id = fr.form_id AND fd.employee_id = fr.employee_id
      LEFT JOIN tbl_employee u ON fd.employee_id = u.employee_id
      WHERE 1=1
    `;
    const formsParams: any[] = [];
    if (filters.department) {
      formsParams.push(filters.department);
      formsQuery += ` AND u.department = $${formsParams.length}`;
    }
    if (filters.employeeId) {
      formsParams.push(filters.employeeId);
      formsQuery += ` AND fd.employee_id = $${formsParams.length}`;
    }
    if (filters.formId) {
      formsParams.push(filters.formId);
      formsQuery += ` AND fd.form_id = $${formsParams.length}`;
    }
    if (filters.startDate) {
      formsParams.push(new Date(filters.startDate));
      formsQuery += ` AND fd.distributed_at >= $${formsParams.length}`;
    }
    if (filters.endDate) {
      formsParams.push(new Date(filters.endDate));
      formsQuery += ` AND fd.distributed_at <= $${formsParams.length}`;
    }
    formsQuery += ` ORDER BY fd.distributed_at DESC`;

    const formsResult = await pool.query(formsQuery, formsParams);
    const formsRowsWithNames = await this.withEmployeeNames(formsResult.rows as any[]);

    const formsBreakdown = formsRowsWithNames.map((row) => {
      const isSubmitted = row.response_status === 'submitted' && !!row.submitted_at;
      const deadline = row.deadline_at ? new Date(row.deadline_at) : null;
      let status: 'on_time' | 'late' | 'overdue' | 'pending' = 'pending';

      if (isSubmitted) {
        const submittedAtDate = new Date(row.submitted_at);
        if (deadline && submittedAtDate > deadline) {
          status = 'late';
        } else {
          status = 'on_time';
        }
      } else {
        if (deadline && now > deadline) {
          status = 'overdue';
        } else {
          status = 'pending';
        }
      }

      return {
        distributionId: row.distribution_id,
        formId: row.form_id,
        formTitle: row.form_title,
        employeeId: row.employee_id,
        employeeName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.employee_id,
        department: row.department || 'N/A',
        distributedAt: row.distributed_at,
        deadlineAt: row.deadline_at,
        submittedAt: row.submitted_at,
        status,
        completionMs: row.completion_ms,
      };
    });

    // 2. Fetch Communications Recipients & Responses
    let commsQuery = `
      SELECT 
        cr.id as recipient_id,
        cr.communication_id,
        c.title as communication_title,
        cr.employee_id,
        u.department,
        cr.email_sent_at,
        c.deadline_at,
        cr.responded_at,
        cr.response_text
      FROM tbl_communication_recipients cr
      JOIN tbl_communications c ON cr.communication_id = c.id
      LEFT JOIN tbl_employee u ON cr.employee_id = u.employee_id
      WHERE 1=1
    `;
    const commsParams: any[] = [];
    if (filters.department) {
      commsParams.push(filters.department);
      commsQuery += ` AND u.department = $${commsParams.length}`;
    }
    if (filters.employeeId) {
      commsParams.push(filters.employeeId);
      commsQuery += ` AND cr.employee_id = $${commsParams.length}`;
    }
    if (filters.communicationId) {
      commsParams.push(filters.communicationId);
      commsQuery += ` AND cr.communication_id = $${commsParams.length}`;
    }
    if (filters.startDate) {
      commsParams.push(new Date(filters.startDate));
      commsQuery += ` AND cr.email_sent_at >= $${commsParams.length}`;
    }
    if (filters.endDate) {
      commsParams.push(new Date(filters.endDate));
      commsQuery += ` AND cr.email_sent_at <= $${commsParams.length}`;
    }
    commsQuery += ` ORDER BY cr.email_sent_at DESC`;

    const commsResult = await pool.query(commsQuery, commsParams);
    const commsRowsWithNames = await this.withEmployeeNames(commsResult.rows as any[]);

    const communicationsBreakdown = commsRowsWithNames.map((row) => {
      const isAcknowledged = !!row.responded_at;
      const deadline = row.deadline_at ? new Date(row.deadline_at) : null;
      let status: 'on_time' | 'late' | 'overdue' | 'pending' = 'pending';

      if (isAcknowledged) {
        const respondedAtDate = new Date(row.responded_at);
        if (deadline && respondedAtDate > deadline) {
          status = 'late';
        } else {
          status = 'on_time';
        }
      } else {
        if (deadline && now > deadline) {
          status = 'overdue';
        } else {
          status = 'pending';
        }
      }

      return {
        recipientId: row.recipient_id,
        communicationId: row.communication_id,
        communicationTitle: row.communication_title,
        employeeId: row.employee_id,
        employeeName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.employee_id,
        department: row.department || 'N/A',
        emailSentAt: row.email_sent_at,
        deadlineAt: row.deadline_at,
        respondedAt: row.responded_at,
        responseText: row.response_text,
        status,
      };
    });

    // Apply Status & Search Filtering
    let filteredForms = formsBreakdown;
    let filteredComms = communicationsBreakdown;

    if (filters.status && filters.status !== 'all') {
      filteredForms = filteredForms.filter((f) => f.status === filters.status);
      filteredComms = filteredComms.filter((c) => c.status === filters.status);
    }

    if (filters.search) {
      const term = filters.search.toLowerCase();
      filteredForms = filteredForms.filter(
        (f) =>
          f.employeeName.toLowerCase().includes(term) ||
          f.employeeId.toLowerCase().includes(term) ||
          f.formTitle.toLowerCase().includes(term)
      );
      filteredComms = filteredComms.filter(
        (c) =>
          c.employeeName.toLowerCase().includes(term) ||
          c.employeeId.toLowerCase().includes(term) ||
          c.communicationTitle.toLowerCase().includes(term)
      );
    }

    // Summary statistics for forms
    const formStats = {
      totalAssigned: formsBreakdown.length,
      onTimeCount: formsBreakdown.filter((f) => f.status === 'on_time').length,
      lateCount: formsBreakdown.filter((f) => f.status === 'late').length,
      overdueCount: formsBreakdown.filter((f) => f.status === 'overdue').length,
      pendingCount: formsBreakdown.filter((f) => f.status === 'pending').length,
      onTimePercentage: 0,
    };
    formStats.onTimePercentage = formStats.totalAssigned
      ? Math.round((formStats.onTimeCount / formStats.totalAssigned) * 100)
      : 100;

    // Summary statistics for communications
    const commStats = {
      totalRecipients: communicationsBreakdown.length,
      onTimeCount: communicationsBreakdown.filter((c) => c.status === 'on_time').length,
      lateCount: communicationsBreakdown.filter((c) => c.status === 'late').length,
      overdueCount: communicationsBreakdown.filter((c) => c.status === 'overdue').length,
      pendingCount: communicationsBreakdown.filter((c) => c.status === 'pending').length,
      onTimePercentage: 0,
    };
    commStats.onTimePercentage = commStats.totalRecipients
      ? Math.round((commStats.onTimeCount / commStats.totalRecipients) * 100)
      : 100;

    // Aggregate user breakdown
    const userMap = new Map<string, any>();

    const getOrCreateUserEntry = (empId: string, empName: string, dept: string) => {
      if (!userMap.has(empId)) {
        userMap.set(empId, {
          employeeId: empId,
          employeeName: empName,
          department: dept,
          forms: { total: 0, onTime: 0, late: 0, overdue: 0, pending: 0 },
          communications: { total: 0, onTime: 0, late: 0, overdue: 0, pending: 0 },
        });
      }
      return userMap.get(empId)!;
    };

    formsBreakdown.forEach((f) => {
      const entry = getOrCreateUserEntry(f.employeeId, f.employeeName, f.department);
      entry.forms.total += 1;
      if (f.status === 'on_time') entry.forms.onTime += 1;
      if (f.status === 'late') entry.forms.late += 1;
      if (f.status === 'overdue') entry.forms.overdue += 1;
      if (f.status === 'pending') entry.forms.pending += 1;
    });

    communicationsBreakdown.forEach((c) => {
      const entry = getOrCreateUserEntry(c.employeeId, c.employeeName, c.department);
      entry.communications.total += 1;
      if (c.status === 'on_time') entry.communications.onTime += 1;
      if (c.status === 'late') entry.communications.late += 1;
      if (c.status === 'overdue') entry.communications.overdue += 1;
      if (c.status === 'pending') entry.communications.pending += 1;
    });

    const userBreakdown = Array.from(userMap.values()).map((user) => {
      const totalItems = user.forms.total + user.communications.total;
      const onTimeItems = user.forms.onTime + user.communications.onTime;
      const complianceRate = totalItems > 0 ? Math.round((onTimeItems / totalItems) * 100) : 100;
      return {
        ...user,
        complianceRate,
      };
    });

    userBreakdown.sort((a, b) => a.complianceRate - b.complianceRate);

    const totalAssignedCombined = formStats.totalAssigned + commStats.totalRecipients;
    const totalOnTimeCombined = formStats.onTimeCount + commStats.onTimeCount;
    const overallComplianceRate = totalAssignedCombined > 0
      ? Math.round((totalOnTimeCombined / totalAssignedCombined) * 100)
      : 100;

    // Fetch filter options for dropdowns
    const empOptionsResult = await pool.query(
      `SELECT DISTINCT employee_id, department FROM tbl_employee WHERE employee_id IS NOT NULL`
    );
    const empRowsWithNames = await this.withEmployeeNames(empOptionsResult.rows as any[]);
    const employeesList = empRowsWithNames.map(r => ({
      employeeId: r.employee_id,
      employeeName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.employee_id,
      department: r.department || 'N/A',
    })).sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    const formsOptionsResult = await pool.query(`SELECT id, title FROM tbl_forms ORDER BY title ASC`);
    const commsOptionsResult = await pool.query(`SELECT id, title FROM tbl_communications ORDER BY title ASC`);
    const deptOptionsResult = await pool.query(
      `SELECT DISTINCT department FROM tbl_employee WHERE department IS NOT NULL AND department != '' ORDER BY department ASC`
    );

    return {
      summary: {
        forms: formStats,
        communications: commStats,
        overallComplianceRate,
      },
      filterOptions: {
        employees: employeesList,
        forms: formsOptionsResult.rows.map(r => ({ id: Number(r.id), title: r.title })),
        communications: commsOptionsResult.rows.map(r => ({ id: Number(r.id), title: r.title })),
        departments: deptOptionsResult.rows.map(r => r.department as string),
      },
      formsBreakdown: filteredForms,
      communicationsBreakdown: filteredComms,
      userBreakdown,
    };
  }

  buildSubmissionsBreakdownWorkbook(data: any) {
    const workbook = new ExcelJS.Workbook();

    // 1. Forms Worksheet
    const formsWs = workbook.addWorksheet('Forms Submissions');
    formsWs.columns = [
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Employee Name', key: 'employeeName', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Form Title', key: 'formTitle', width: 30 },
      { header: 'Distributed At', key: 'distributedAt', width: 20 },
      { header: 'Deadline', key: 'deadlineAt', width: 20 },
      { header: 'Submitted At', key: 'submittedAt', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
    ];
    formsWs.getRow(1).font = { bold: true };
    data.formsBreakdown.forEach((row: any) => {
      formsWs.addRow({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: row.department,
        formTitle: row.formTitle,
        distributedAt: row.distributedAt ? new Date(row.distributedAt).toLocaleString() : '',
        deadlineAt: row.deadlineAt ? new Date(row.deadlineAt).toLocaleString() : 'No deadline',
        submittedAt: row.submittedAt ? new Date(row.submittedAt).toLocaleString() : 'Not submitted',
        status: row.status.replace('_', ' ').toUpperCase(),
      });
    });

    // 2. Communications Worksheet
    const commsWs = workbook.addWorksheet('Communications');
    commsWs.columns = [
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Employee Name', key: 'employeeName', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Communication Title', key: 'communicationTitle', width: 30 },
      { header: 'Email Sent At', key: 'emailSentAt', width: 20 },
      { header: 'Deadline', key: 'deadlineAt', width: 20 },
      { header: 'Responded At', key: 'respondedAt', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Response Text', key: 'responseText', width: 35 },
    ];
    commsWs.getRow(1).font = { bold: true };
    data.communicationsBreakdown.forEach((row: any) => {
      commsWs.addRow({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: row.department,
        communicationTitle: row.communicationTitle,
        emailSentAt: row.emailSentAt ? new Date(row.emailSentAt).toLocaleString() : '',
        deadlineAt: row.deadlineAt ? new Date(row.deadlineAt).toLocaleString() : 'No deadline',
        respondedAt: row.respondedAt ? new Date(row.respondedAt).toLocaleString() : 'Not responded',
        status: row.status.replace('_', ' ').toUpperCase(),
        responseText: row.responseText || '',
      });
    });

    // 3. User Compliance Summary Worksheet
    const userWs = workbook.addWorksheet('User Compliance Summary');
    userWs.columns = [
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Employee Name', key: 'employeeName', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Forms Total', key: 'formsTotal', width: 12 },
      { header: 'Forms On-Time', key: 'formsOnTime', width: 14 },
      { header: 'Forms Late', key: 'formsLate', width: 12 },
      { header: 'Forms Overdue', key: 'formsOverdue', width: 14 },
      { header: 'Comms Total', key: 'commsTotal', width: 12 },
      { header: 'Comms On-Time', key: 'commsOnTime', width: 14 },
      { header: 'Comms Late', key: 'commsLate', width: 12 },
      { header: 'Comms Overdue', key: 'commsOverdue', width: 14 },
      { header: 'Overall Compliance Rate (%)', key: 'complianceRate', width: 25 },
    ];
    userWs.getRow(1).font = { bold: true };
    data.userBreakdown.forEach((row: any) => {
      userWs.addRow({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: row.department,
        formsTotal: row.forms.total,
        formsOnTime: row.forms.onTime,
        formsLate: row.forms.late,
        formsOverdue: row.forms.overdue,
        commsTotal: row.communications.total,
        commsOnTime: row.communications.onTime,
        commsLate: row.communications.late,
        commsOverdue: row.communications.overdue,
        complianceRate: `${row.complianceRate}%`,
      });
    });

    return workbook;
  }
}

