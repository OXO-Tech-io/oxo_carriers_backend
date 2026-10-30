import { db } from '../../db';
import { employeeBreakLogs, type EmployeeBreakLog } from '../../db/schema';
import { and, eq, isNull } from 'drizzle-orm';

export class BreakLogModel {
  /** The employee's currently-open break, if any. */
  static async findOpen(employeeId: string): Promise<EmployeeBreakLog | null> {
    const log = await db.query.employeeBreakLogs.findFirst({
      where: and(eq(employeeBreakLogs.employeeId, employeeId), isNull(employeeBreakLogs.breakEnd)),
    });
    return log ?? null;
  }

  static async start(employeeId: string, sessionId: number): Promise<EmployeeBreakLog> {
    const [inserted] = await db
      .insert(employeeBreakLogs)
      .values({ employeeId, sessionId })
      .returning();
    if (!inserted) throw new Error('Failed to start break');
    return inserted;
  }

  /** Closes the employee's open break, if any. Returns null if none is open. */
  static async endOpen(employeeId: string): Promise<EmployeeBreakLog | null> {
    const open = await this.findOpen(employeeId);
    if (!open) return null;

    const breakEnd = new Date();
    const breakStart = open.breakStart ?? breakEnd;
    const durationSec = Math.max(0, Math.round((breakEnd.getTime() - breakStart.getTime()) / 1000));

    const [updated] = await db
      .update(employeeBreakLogs)
      .set({ breakEnd, durationSec })
      .where(eq(employeeBreakLogs.id, open.id))
      .returning();
    return updated ?? null;
  }
}
