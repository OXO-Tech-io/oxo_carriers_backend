import { db } from '../../db';
import { workLogs, employee as users, type WorkLog as DrizzleWorkLog } from '../../db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { EmployeeModel } from '../../employees/Employee';

export type WorkLogInput = {
  employeeId: string;
  workDate: string;
  taskDescription: string;
  hoursSpent: number;
  remarks?: string | null;
  // Stamped by WorkLogDeadlineService before insert - see work-log-deadline.service.ts.
  isLate?: boolean;
  deadlineAt?: Date | null;
};

export interface WorkLogUserSummary {
  userId: number;
  employeeId: string | null;
  firstName: string;
  lastName: string;
  totalHours: number;
  entryCount: number;
  lateCount: number;
}

export class WorkLogModel {
  static async create(data: WorkLogInput): Promise<DrizzleWorkLog> {
    const [inserted] = await db
      .insert(workLogs)
      .values({
        ...data,
        hoursSpent: String(data.hoursSpent),
        isLate: data.isLate ?? false,
        deadlineAt: data.deadlineAt ?? null,
      })
      .returning();
    if (!inserted) throw new Error('Failed to create work log');
    return inserted;
  }

  static async createMany(entries: WorkLogInput[]): Promise<DrizzleWorkLog[]> {
    if (!entries.length) return [];
    return Promise.all(entries.map((entry) => this.create(entry)));
  }

  static async findByEmployeeId(
    employeeId: string,
    filters?: { from?: string; to?: string }
  ): Promise<DrizzleWorkLog[]> {
    const conditions = [eq(workLogs.employeeId, employeeId)];
    if (filters?.from) conditions.push(gte(workLogs.workDate, filters.from));
    if (filters?.to) conditions.push(lte(workLogs.workDate, filters.to));
    return db.query.workLogs.findMany({
      where: and(...conditions),
      orderBy: (t, { desc }) => [desc(t.workDate)],
    });
  }

  static async listAll(filters?: { employeeId?: string; from?: string; to?: string }): Promise<DrizzleWorkLog[]> {
    const conditions = [];
    if (filters?.employeeId) conditions.push(eq(workLogs.employeeId, filters.employeeId));
    if (filters?.from) conditions.push(gte(workLogs.workDate, filters.from));
    if (filters?.to) conditions.push(lte(workLogs.workDate, filters.to));
    return db.query.workLogs.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: (t, { desc }) => [desc(t.workDate)],
    });
  }

  // firstName/lastName are encrypted - can't be selected, grouped, or sorted
  // in SQL, so only non-PII columns are grouped here; names are batch
  // resolved and the final order applied in application code below.
  static async summaryByUser(filters?: { from?: string; to?: string }): Promise<WorkLogUserSummary[]> {
    const conditions = [];
    if (filters?.from) conditions.push(gte(workLogs.workDate, filters.from));
    if (filters?.to) conditions.push(lte(workLogs.workDate, filters.to));

    const rows = await db
      .select({
        userId: users.id,
        employeeId: workLogs.employeeId,
        totalHours: sql<string>`SUM(${workLogs.hoursSpent})`,
        entryCount: sql<string>`COUNT(*)`,
        lateCount: sql<string>`COUNT(*) FILTER (WHERE ${workLogs.isLate})`,
      })
      .from(workLogs)
      .innerJoin(users, eq(workLogs.employeeId, users.employeeId))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(users.id, workLogs.employeeId);

    const employeeMap = await EmployeeModel.findByEmployeeIds(rows.map((r) => r.employeeId));
    const summaries = rows.map(row => {
      const emp = employeeMap.get(row.employeeId);
      return {
        userId: row.userId,
        employeeId: row.employeeId,
        firstName: emp?.firstName ?? '',
        lastName: emp?.lastName ?? '',
        totalHours: Number(row.totalHours),
        entryCount: Number(row.entryCount),
        lateCount: Number(row.lateCount),
      };
    });
    summaries.sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));
    return summaries;
  }
}
