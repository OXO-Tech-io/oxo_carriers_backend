import ExcelJS from 'exceljs';
import pool from '../../config/database';
import { WorkLogModel, type WorkLogInput } from './WorkLog';
import { EmployeeModel } from '../../employees/Employee';
import { BadRequestError } from '../../utils/AppError';
import { WorkLogEntryInput } from '../../validators/workLog.validator';
import { WorkLogDeadlineService } from './work-log-deadline.service';
import { PERMISSIONS } from '../../common/constants/permissions';
import { ISO_DATE_REGEX } from '../../common/constants/validation';

const TEMPLATE_HEADERS = ['Date', 'Task Description', 'Hours Spent', 'Remarks'];

// Stateless apart from its DB reads, so a module-level instance is fine here -
// this file predates Nest DI and is still a plain object export.
const deadlineService = new WorkLogDeadlineService();

export interface WorkLogDailyStatus {
  date: string;
  /** Employees holding the work_logs permission (any level) - who's expected to log. */
  totalEligible: number;
  submittedCount: number;
  onTimeCount: number;
  lateCount: number;
  pendingCount: number;
}

/**
 * Employees expected to submit a work log: those holding the work_logs
 * permission key at any level. tbl_user_permissions is the only place that
 * distinction is recorded (role alone doesn't gate the Work Log page - see
 * Sidebar.tsx, gated on the permission key, not on role).
 */
async function countEligibleWorkLogEmployees(): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT employee_id) AS count
       FROM tbl_user_permissions
      WHERE permission_key = $1`,
    [PERMISSIONS.WORK_LOGS],
  );
  return Number((result.rows[0] as any)?.count ?? 0);
}

/**
 * Stamp isLate/deadlineAt on rows about to be inserted. Late rows are still
 * inserted - the deadline flags lateness, it never blocks a submission.
 */
async function withDeadlineFlags(rows: WorkLogInput[]): Promise<WorkLogInput[]> {
  if (!rows.length) return rows;
  const submittedAt = new Date();
  const outcomes = await deadlineService.evaluateMany(
    rows.map((row) => row.workDate),
    submittedAt,
  );
  return rows.map((row, index) => ({
    ...row,
    isLate: outcomes[index].isLate,
    deadlineAt: outcomes[index].deadlineAt,
  }));
}

// `userId` filters below are the wire/API field (internal numeric employee
// id, unchanged for minimal API-surface churn) - resolved here to the
// business employeeId that tbl_work_logs.employee_id now stores.
async function resolveEmployeeIdFilter(userId?: number): Promise<string | undefined> {
  if (!userId) return undefined;
  const employee = await EmployeeModel.findById(userId);
  return employee?.employeeId ?? undefined;
}

export const workLogService = {
  async submitEntries(employeeId: string, entries: WorkLogEntryInput[]) {
    const rows: WorkLogInput[] = entries.map((entry) => ({
      employeeId,
      workDate: entry.workDate,
      taskDescription: entry.taskDescription,
      hoursSpent: entry.hoursSpent,
      remarks: entry.remarks ?? null,
    }));
    return WorkLogModel.createMany(await withDeadlineFlags(rows));
  },

  async getDeadline(workDate?: string) {
    return deadlineService.describe(workDate ?? new Date().toISOString().slice(0, 10));
  },

  async getDailyStatus(workDate?: string): Promise<WorkLogDailyStatus> {
    const date = workDate ?? new Date().toISOString().slice(0, 10);
    const [summaries, totalEligible] = await Promise.all([
      WorkLogModel.summaryByUser({ from: date, to: date }),
      countEligibleWorkLogEmployees(),
    ]);

    const submittedCount = summaries.length;
    // An employee counts as "late" for the day if any of that day's entries
    // were - lateCount here is per-employee (see WorkLogUserSummary), not a
    // row count.
    const lateCount = summaries.filter((s) => s.lateCount > 0).length;
    const onTimeCount = submittedCount - lateCount;
    // Employees can submit without (or after losing) work_logs permission -
    // clamp so a stale/edge-case gap never reads as a negative pending count.
    const pendingCount = Math.max(0, totalEligible - submittedCount);

    return { date, totalEligible, submittedCount, onTimeCount, lateCount, pendingCount };
  },

  async updateDeadline(
    updatedBy: number | null,
    updates: { isEnabled?: boolean; deadlineTime?: string; timezone?: string },
  ) {
    return deadlineService.updateSettings(updatedBy, updates);
  },

  async listMine(employeeId: string, filters?: { from?: string; to?: string }) {
    return WorkLogModel.findByEmployeeId(employeeId, filters);
  },

  async listAll(filters?: { userId?: number; from?: string; to?: string }) {
    const employeeId = await resolveEmployeeIdFilter(filters?.userId);
    return WorkLogModel.listAll({ employeeId, from: filters?.from, to: filters?.to });
  },

  async getSummary(filters?: { from?: string; to?: string }) {
    return WorkLogModel.summaryByUser(filters);
  },

  async generateSummaryReport(filters?: { from?: string; to?: string }): Promise<ExcelJS.Buffer> {
    const rows = await WorkLogModel.summaryByUser(filters);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Work Log Summary');
    worksheet.columns = [
      { header: 'Employee ID', key: 'employeeId', width: 18 },
      { header: 'Employee Name', key: 'name', width: 30 },
      { header: 'Total Hours', key: 'totalHours', width: 15 },
      { header: 'Entries', key: 'entryCount', width: 12 },
      { header: 'Late Submissions', key: 'lateCount', width: 18 },
    ];
    worksheet.getRow(1).font = { bold: true };
    rows.forEach(row => {
      worksheet.addRow({
        employeeId: row.employeeId ?? 'N/A',
        name: `${row.firstName} ${row.lastName}`,
        totalHours: row.totalHours,
        entryCount: row.entryCount,
        lateCount: row.lateCount,
      });
    });
    return workbook.xlsx.writeBuffer();
  },

  async generateDetailedReport(filters?: { userId?: number; from?: string; to?: string }): Promise<ExcelJS.Buffer> {
    const employeeId = await resolveEmployeeIdFilter(filters?.userId);
    const rows = await WorkLogModel.listAll({ employeeId, from: filters?.from, to: filters?.to });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Work Log Detail');
    worksheet.columns = [
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Date', key: 'workDate', width: 15 },
      { header: 'Task Description', key: 'task', width: 50 },
      { header: 'Hours Spent', key: 'hours', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Submitted At', key: 'submittedAt', width: 22 },
      { header: 'Deadline', key: 'deadlineAt', width: 22 },
      { header: 'Late Submission', key: 'isLate', width: 16 },
    ];
    worksheet.getRow(1).font = { bold: true };
    rows.forEach(row => {
      worksheet.addRow({
        employeeId: row.employeeId,
        workDate: row.workDate,
        task: row.taskDescription,
        hours: row.hoursSpent,
        remarks: row.remarks ?? '',
        submittedAt: row.createdAt ?? '',
        // No deadline recorded means none applied - weekend, leave-calendar
        // holiday, or the deadline was off when the entry was submitted.
        deadlineAt: row.deadlineAt ?? 'N/A',
        isLate: row.isLate ? 'Yes' : 'No',
      });
    });
    return workbook.xlsx.writeBuffer();
  },

  async generateTemplate(): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Work Log Template');
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Task Description', key: 'task', width: 50 },
      { header: 'Hours Spent', key: 'hours', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 30 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRow({ date: '2026-01-15', task: 'Example: Reviewed client contract', hours: 2.5, remarks: '' });
    return workbook.xlsx.writeBuffer();
  },

  async bulkUpload(
    employeeId: string,
    filePath: string,
  ): Promise<{ success: number; failed: number; errors: string[]; late: number }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new BadRequestError('Invalid Excel file format');

    let headerRowIndex = -1;
    let columnMap: Record<string, number> = {};
    for (let i = 1; i <= Math.min(10, worksheet.rowCount); i++) {
      const row = worksheet.getRow(i);
      const values: Record<string, number> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const text = String(cell.value ?? '').trim().toLowerCase();
        if (text.includes('date')) values.date = colNumber;
        else if (text.includes('task')) values.task = colNumber;
        else if (text.includes('hour')) values.hours = colNumber;
        else if (text.includes('remark')) values.remarks = colNumber;
      });
      if (values.date && values.task && values.hours) {
        headerRowIndex = i;
        columnMap = values;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new BadRequestError(`Could not locate header row. Expected columns: ${TEMPLATE_HEADERS.join(', ')}`);
    }

    const entries: WorkLogInput[] = [];
    const errors: string[] = [];
    let failed = 0;

    for (let i = headerRowIndex + 1; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const dateCell = row.getCell(columnMap.date).value;
      const taskCell = row.getCell(columnMap.task).value;
      const hoursCell = row.getCell(columnMap.hours).value;
      const remarksCell = columnMap.remarks ? row.getCell(columnMap.remarks).value : null;

      if (!dateCell && !taskCell && !hoursCell) continue; // skip blank rows

      const workDate =
        dateCell instanceof Date
          ? dateCell.toISOString().slice(0, 10)
          : String(dateCell ?? '').trim();
      const taskDescription = String(taskCell ?? '').trim();
      const hoursSpent = Number(hoursCell);

      if (!ISO_DATE_REGEX.test(workDate) || !taskDescription || !Number.isFinite(hoursSpent) || hoursSpent <= 0) {
        failed++;
        errors.push(`Row ${i}: invalid or incomplete data`);
        continue;
      }

      entries.push({
        employeeId,
        workDate,
        taskDescription,
        hoursSpent,
        remarks: remarksCell ? String(remarksCell).trim() : null,
      });
    }

    const flagged = await withDeadlineFlags(entries);
    if (flagged.length) {
      await WorkLogModel.createMany(flagged);
    }

    return { success: flagged.length, failed, errors, late: flagged.filter((e) => e.isLate).length };
  },
};
