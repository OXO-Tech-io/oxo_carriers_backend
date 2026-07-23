import { db } from '../db';
import { workLogs, employee as users, type WorkLog as DrizzleWorkLog } from '../db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

export type WorkLogInput = {
  userId: number;
  workDate: string;
  taskDescription: string;
  hoursSpent: number;
  remarks?: string | null;
};

export interface WorkLogUserSummary {
  userId: number;
  employeeId: string | null;
  firstName: string;
  lastName: string;
  totalHours: number;
  entryCount: number;
}

export class WorkLogModel {
  static async create(data: WorkLogInput): Promise<DrizzleWorkLog> {
    const [inserted] = await db
      .insert(workLogs)
      .values({ ...data, hoursSpent: String(data.hoursSpent) })
      .returning();
    if (!inserted) throw new Error('Failed to create work log');
    return inserted;
  }

  static async createMany(entries: WorkLogInput[]): Promise<DrizzleWorkLog[]> {
    if (!entries.length) return [];
    return Promise.all(entries.map((entry) => this.create(entry)));
  }

  static async findByUserId(
    userId: number,
    filters?: { from?: string; to?: string }
  ): Promise<DrizzleWorkLog[]> {
    const conditions = [eq(workLogs.userId, userId)];
    if (filters?.from) conditions.push(gte(workLogs.workDate, filters.from));
    if (filters?.to) conditions.push(lte(workLogs.workDate, filters.to));
    return db.query.workLogs.findMany({
      where: and(...conditions),
      orderBy: (t, { desc }) => [desc(t.workDate)],
    });
  }

  static async listAll(filters?: { userId?: number; from?: string; to?: string }): Promise<DrizzleWorkLog[]> {
    const conditions = [];
    if (filters?.userId) conditions.push(eq(workLogs.userId, filters.userId));
    if (filters?.from) conditions.push(gte(workLogs.workDate, filters.from));
    if (filters?.to) conditions.push(lte(workLogs.workDate, filters.to));
    return db.query.workLogs.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: (t, { desc }) => [desc(t.workDate)],
    });
  }

  static async summaryByUser(filters?: { from?: string; to?: string }): Promise<WorkLogUserSummary[]> {
    const conditions = [];
    if (filters?.from) conditions.push(gte(workLogs.workDate, filters.from));
    if (filters?.to) conditions.push(lte(workLogs.workDate, filters.to));

    const rows = await db
      .select({
        userId: workLogs.userId,
        employeeId: users.employeeId,
        firstName: users.firstName,
        lastName: users.lastName,
        totalHours: sql<string>`SUM(${workLogs.hoursSpent})`,
        entryCount: sql<string>`COUNT(*)`,
      })
      .from(workLogs)
      .innerJoin(users, eq(workLogs.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(workLogs.userId, users.employeeId, users.firstName, users.lastName)
      .orderBy(users.firstName, users.lastName);

    return rows.map(row => ({
      userId: row.userId,
      employeeId: row.employeeId,
      firstName: row.firstName,
      lastName: row.lastName,
      totalHours: Number(row.totalHours),
      entryCount: Number(row.entryCount),
    }));
  }
}
