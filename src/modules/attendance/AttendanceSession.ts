import { randomBytes } from 'crypto';
import { db } from '../../db';
import { employeeWorkSessions, type EmployeeWorkSession } from '../../db/schema';
import { and, eq, gte, lt } from 'drizzle-orm';

export class AttendanceSessionModel {
  static async findActive(employeeId: string): Promise<EmployeeWorkSession | null> {
    const session = await db.query.employeeWorkSessions.findFirst({
      where: and(eq(employeeWorkSessions.employeeId, employeeId), eq(employeeWorkSessions.status, 'active')),
    });
    return session ?? null;
  }

  static async create(employeeId: string): Promise<EmployeeWorkSession> {
    const [inserted] = await db
      .insert(employeeWorkSessions)
      .values({
        employeeId,
        sessionToken: randomBytes(48).toString('hex'),
        status: 'active',
      })
      .returning();
    if (!inserted) throw new Error('Failed to create attendance session');
    return inserted;
  }

  /** Closes the employee's open session, if any. Returns null if none is open. */
  static async endActive(employeeId: string): Promise<EmployeeWorkSession | null> {
    const active = await this.findActive(employeeId);
    if (!active) return null;

    const logoutAt = new Date();
    const loginAt = active.loginAt ?? logoutAt;
    const totalDurationSec = Math.max(0, Math.round((logoutAt.getTime() - loginAt.getTime()) / 1000));

    const [updated] = await db
      .update(employeeWorkSessions)
      .set({ logoutAt, status: 'ended', endReason: 'user_logout', totalDurationSec })
      .where(eq(employeeWorkSessions.id, active.id))
      .returning();
    return updated ?? null;
  }

  /** All of an employee's sessions with login_at at or after `since`, most recent first. */
  static async findSince(employeeId: string, since: Date): Promise<EmployeeWorkSession[]> {
    return db.query.employeeWorkSessions.findMany({
      where: and(eq(employeeWorkSessions.employeeId, employeeId), gte(employeeWorkSessions.loginAt, since)),
      orderBy: (t, { desc }) => [desc(t.loginAt)],
    });
  }

  /** Every employee's sessions with login_at in [from, to), most recent first - the admin/report view. */
  static async findAllInRange(from: Date, to: Date): Promise<EmployeeWorkSession[]> {
    return db.query.employeeWorkSessions.findMany({
      where: and(gte(employeeWorkSessions.loginAt, from), lt(employeeWorkSessions.loginAt, to)),
      orderBy: (t, { desc }) => [desc(t.loginAt)],
    });
  }
}
