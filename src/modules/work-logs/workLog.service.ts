import ExcelJS from 'exceljs';
import pool from '../../config/database';
import { WorkLogModel, type WorkLogInput, type WorkLogUserSummary } from './WorkLog';
import { EmployeeModel } from '../../employees/Employee';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/AppError';
import { WorkLogEntryInput } from '../../validators/workLog.validator';
import { WorkLogDeadlineService } from './work-log-deadline.service';
import { ISO_DATE_REGEX } from '../../common/constants/validation';

const TEMPLATE_HEADERS = ['Date', 'Task Description', 'Minutes Spent', 'Remarks'];
const MAX_MINUTES_PER_DAY = 1440; // 24 hours

// Stateless apart from its DB reads, so a module-level instance is fine here -
// this file predates Nest DI and is still a plain object export.
const deadlineService = new WorkLogDeadlineService();

export interface WorkLogDailyStatus {
  from: string;
  to: string;
  /** Employees required to submit work logs - all active employees in the system. */
  totalEligible: number;
  submittedCount: number;
  onTimeCount: number;
  lateCount: number;
  pendingCount: number;
}

/**
 * Employees expected to submit a work log: every active employee in the
 * system (see OCD-468 - this previously counted only employees holding an
 * explicit `work_logs` permission row, which undercounted whenever that
 * permission table lagged behind who's actually active).
 */
async function countEligibleWorkLogEmployees(): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) AS count FROM tbl_employee WHERE status = 'active'`,
  );
  return Number((result.rows[0] as any)?.count ?? 0);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Worklogs record work already performed - reject anything dated after today. */
function assertNotFutureDate(workDate: string): void {
  if (workDate.slice(0, 10) > todayKey()) {
    throw new BadRequestError('Worklogs cannot be submitted for future dates.');
  }
}

/**
 * Enforces the 24h/day (1440 minute) cap across every entry for a given
 * employee + work date - both entries already stored and the ones in the
 * current request/upload. `excludeId` lets an in-place edit recheck the day's
 * total without double-counting the row being replaced.
 */
async function assertDailyCap(
  employeeId: string,
  workDate: string,
  additionalMinutes: number,
  excludeId?: number,
): Promise<void> {
  const existing = await WorkLogModel.sumMinutesForDate(employeeId, workDate, excludeId);
  if (existing + additionalMinutes > MAX_MINUTES_PER_DAY) {
    throw new BadRequestError(
      `Total worklog minutes for ${workDate} cannot exceed ${MAX_MINUTES_PER_DAY} minutes (24 hours).`,
    );
  }
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

/**
 * Whenever the deadline feature is currently switched off, every submission
 * should read as on-time - regardless of what was stamped on it while a
 * (possibly different) deadline was active (see OCD-469: removing the
 * deadline must be reflected immediately, not just for future submissions).
 */
async function isDeadlineCurrentlyEnabled(): Promise<boolean> {
  const settings = await deadlineService.getSettings();
  return settings.isEnabled;
}

function neutralizeLateRows<T extends { isLate: boolean }>(rows: T[]): T[] {
  return rows.map((row) => (row.isLate ? { ...row, isLate: false } : row));
}

function neutralizeLateSummaries(summaries: WorkLogUserSummary[]): WorkLogUserSummary[] {
  return summaries.map((s) => (s.lateCount > 0 ? { ...s, lateCount: 0 } : s));
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
    for (const entry of entries) {
      assertNotFutureDate(entry.workDate);
    }

    // Cap check: sum of this batch's minutes per date, plus whatever's
    // already stored for that employee/date.
    const minutesByDate = new Map<string, number>();
    for (const entry of entries) {
      minutesByDate.set(entry.workDate, (minutesByDate.get(entry.workDate) ?? 0) + entry.minutesSpent);
    }
    for (const [workDate, minutes] of minutesByDate) {
      await assertDailyCap(employeeId, workDate, minutes);
    }

    const rows: WorkLogInput[] = entries.map((entry) => ({
      employeeId,
      workDate: entry.workDate,
      taskDescription: entry.taskDescription,
      minutesSpent: entry.minutesSpent,
      remarks: entry.remarks ?? null,
    }));
    return WorkLogModel.createMany(await withDeadlineFlags(rows));
  },

  async updateEntry(employeeId: string, id: number, entry: WorkLogEntryInput) {
    const existing = await WorkLogModel.findById(id);
    if (!existing) throw new NotFoundError('Work log entry not found');
    if (existing.employeeId !== employeeId) throw new ForbiddenError('You can only edit your own work log entries');

    assertNotFutureDate(entry.workDate);
    await assertDailyCap(employeeId, entry.workDate, entry.minutesSpent, id);

    return WorkLogModel.update(id, {
      workDate: entry.workDate,
      taskDescription: entry.taskDescription,
      minutesSpent: entry.minutesSpent,
      remarks: entry.remarks ?? null,
    });
  },

  async getDeadline(workDate?: string) {
    return deadlineService.describe(workDate ?? todayKey());
  },

  /** Range defaults to a single day (today, or the given `date`) when no `from`/`to` is given. */
  async getDailyStatus(params?: { date?: string; from?: string; to?: string }): Promise<WorkLogDailyStatus> {
    const single = params?.date ?? todayKey();
    const from = params?.from ?? single;
    const to = params?.to ?? params?.from ?? single;

    const [rawSummaries, totalEligible, deadlineEnabled] = await Promise.all([
      WorkLogModel.summaryByUser({ from, to }),
      countEligibleWorkLogEmployees(),
      isDeadlineCurrentlyEnabled(),
    ]);
    const summaries = deadlineEnabled ? rawSummaries : neutralizeLateSummaries(rawSummaries);

    const submittedCount = summaries.length;
    // An employee counts as "late" for the range if any of their entries in
    // it were - lateCount here is per-employee (see WorkLogUserSummary), not
    // a row count.
    const lateCount = summaries.filter((s) => s.lateCount > 0).length;
    const onTimeCount = submittedCount - lateCount;
    // Employees can submit without (or after losing) active status -
    // clamp so a stale/edge-case gap never reads as a negative pending count.
    const pendingCount = Math.max(0, totalEligible - submittedCount);

    return { from, to, totalEligible, submittedCount, onTimeCount, lateCount, pendingCount };
  },

  async updateDeadline(
    updatedBy: number | null,
    updates: { isEnabled?: boolean; deadlineTime?: string; timezone?: string },
  ) {
    return deadlineService.updateSettings(updatedBy, updates);
  },

  async listMine(employeeId: string, filters?: { from?: string; to?: string }) {
    const rows = await WorkLogModel.findByEmployeeId(employeeId, filters);
    return (await isDeadlineCurrentlyEnabled()) ? rows : neutralizeLateRows(rows);
  },

  async listAll(filters?: { userId?: number; from?: string; to?: string }) {
    const employeeId = await resolveEmployeeIdFilter(filters?.userId);
    const rows = await WorkLogModel.listAll({ employeeId, from: filters?.from, to: filters?.to });
    return (await isDeadlineCurrentlyEnabled()) ? rows : neutralizeLateRows(rows);
  },

  async getSummary(filters?: { from?: string; to?: string }) {
    const summaries = await WorkLogModel.summaryByUser(filters);
    return (await isDeadlineCurrentlyEnabled()) ? summaries : neutralizeLateSummaries(summaries);
  },

  async generateSummaryReport(filters?: { from?: string; to?: string }): Promise<ExcelJS.Buffer> {
    const rows = await this.getSummary(filters);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Work Log Summary');
    worksheet.columns = [
      { header: 'Employee ID', key: 'employeeId', width: 18 },
      { header: 'Employee Name', key: 'name', width: 30 },
      { header: 'Total Minutes', key: 'totalMinutes', width: 15 },
      { header: 'Entries', key: 'entryCount', width: 12 },
      { header: 'Late Submissions', key: 'lateCount', width: 18 },
    ];
    worksheet.getRow(1).font = { bold: true };
    rows.forEach(row => {
      worksheet.addRow({
        employeeId: row.employeeId ?? 'N/A',
        name: `${row.firstName} ${row.lastName}`,
        totalMinutes: row.totalMinutes,
        entryCount: row.entryCount,
        lateCount: row.lateCount,
      });
    });
    return workbook.xlsx.writeBuffer();
  },

  async generateDetailedReport(filters?: { userId?: number; from?: string; to?: string }): Promise<ExcelJS.Buffer> {
    const employeeId = await resolveEmployeeIdFilter(filters?.userId);
    const [rows, deadlineEnabled] = await Promise.all([
      WorkLogModel.listAll({ employeeId, from: filters?.from, to: filters?.to }),
      isDeadlineCurrentlyEnabled(),
    ]);
    const effectiveRows = deadlineEnabled ? rows : neutralizeLateRows(rows);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Work Log Detail');
    worksheet.columns = [
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Date', key: 'workDate', width: 15 },
      { header: 'Task Description', key: 'task', width: 50 },
      { header: 'Minutes Spent', key: 'minutes', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Submitted At', key: 'submittedAt', width: 22 },
      { header: 'Deadline', key: 'deadlineAt', width: 22 },
      { header: 'Late Submission', key: 'isLate', width: 16 },
      { header: 'Edited', key: 'isEdited', width: 12 },
      { header: 'Last Modified', key: 'lastModifiedAt', width: 22 },
    ];
    worksheet.getRow(1).font = { bold: true };
    effectiveRows.forEach(row => {
      worksheet.addRow({
        employeeId: row.employeeId,
        workDate: row.workDate,
        task: row.taskDescription,
        minutes: row.minutesSpent,
        remarks: row.remarks ?? '',
        submittedAt: row.createdAt ?? '',
        // No deadline recorded means none applied - weekend, leave-calendar
        // holiday, or the deadline was off when the entry was submitted.
        deadlineAt: row.deadlineAt ?? 'N/A',
        isLate: row.isLate ? 'Yes' : 'No',
        isEdited: row.isEdited ? 'Yes' : 'No',
        lastModifiedAt: row.lastModifiedAt ?? '',
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
      { header: 'Minutes Spent', key: 'minutes', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 30 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRow({ date: '2026-01-15', task: 'Example: Reviewed client contract', minutes: 150, remarks: '' });
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
        else if (text.includes('minute')) values.minutes = colNumber;
        else if (text.includes('remark')) values.remarks = colNumber;
      });
      if (values.date && values.task && values.minutes) {
        headerRowIndex = i;
        columnMap = values;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new BadRequestError(`Could not locate header row. Expected columns: ${TEMPLATE_HEADERS.join(', ')}`);
    }

    const parsed: WorkLogInput[] = [];
    const errors: string[] = [];
    let failed = 0;
    const today = todayKey();
    // Running per-date total across the whole file, seeded with what's
    // already stored, so a file can't push a day over the cap even by
    // spreading entries across many rows.
    const minutesByDate = new Map<string, number>();

    for (let i = headerRowIndex + 1; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const dateCell = row.getCell(columnMap.date).value;
      const taskCell = row.getCell(columnMap.task).value;
      const minutesCell = row.getCell(columnMap.minutes).value;
      const remarksCell = columnMap.remarks ? row.getCell(columnMap.remarks).value : null;

      if (!dateCell && !taskCell && !minutesCell) continue; // skip blank rows

      const workDate =
        dateCell instanceof Date
          ? dateCell.toISOString().slice(0, 10)
          : String(dateCell ?? '').trim();
      const taskDescription = String(taskCell ?? '').trim();
      const minutesSpent = Number(minutesCell);

      // Checked in order, and each with its own message - a row can only fail
      // for one reason at a time, so "invalid or incomplete data" (which gave
      // no clue which field was wrong, or that 1440 is a minutes/24h limit)
      // never has to be a catch-all again. See OCD-462.
      if (!ISO_DATE_REGEX.test(workDate)) {
        failed++;
        errors.push(`Row ${i}: invalid or missing date - expected YYYY-MM-DD`);
        continue;
      }
      if (!taskDescription) {
        failed++;
        errors.push(`Row ${i}: task description is required`);
        continue;
      }
      if (!Number.isInteger(minutesSpent) || minutesSpent <= 0 || minutesSpent > MAX_MINUTES_PER_DAY) {
        failed++;
        errors.push(
          `Row ${i}: minutes must be a whole number between 1 and ${MAX_MINUTES_PER_DAY} (24 hours) - got "${minutesCell}"`,
        );
        continue;
      }

      if (workDate > today) {
        failed++;
        errors.push(`Row ${i}: worklogs cannot be submitted for future dates`);
        continue;
      }

      const existingForDate =
        minutesByDate.get(workDate) ?? (await WorkLogModel.sumMinutesForDate(employeeId, workDate));
      if (existingForDate + minutesSpent > MAX_MINUTES_PER_DAY) {
        failed++;
        errors.push(`Row ${i}: total worklog minutes for ${workDate} cannot exceed ${MAX_MINUTES_PER_DAY} minutes (24 hours)`);
        minutesByDate.set(workDate, existingForDate);
        continue;
      }
      minutesByDate.set(workDate, existingForDate + minutesSpent);

      parsed.push({
        employeeId,
        workDate,
        taskDescription,
        minutesSpent,
        remarks: remarksCell ? String(remarksCell).trim() : null,
      });
    }

    const flagged = await withDeadlineFlags(parsed);
    if (flagged.length) {
      await WorkLogModel.createMany(flagged);
    }

    return { success: flagged.length, failed, errors, late: flagged.filter((e) => e.isLate).length };
  },
};
