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

  /** Marks a session ended at the given time, computing its worked duration. */
  private static async close(
    session: EmployeeWorkSession,
    logoutAt: Date,
    endReason: string,
  ): Promise<EmployeeWorkSession | null> {
    const loginAt = session.loginAt ?? logoutAt;
    const totalDurationSec = Math.max(0, Math.round((logoutAt.getTime() - loginAt.getTime()) / 1000));

    const [updated] = await db
      .update(employeeWorkSessions)
      .set({ logoutAt, status: 'ended', endReason, totalDurationSec })
      .where(eq(employeeWorkSessions.id, session.id))
      .returning();
    return updated ?? null;
  }

  /** Closes the employee's open session, if any. Returns null if none is open. */
  static async endActive(employeeId: string): Promise<EmployeeWorkSession | null> {
    const active = await this.findActive(employeeId);
    if (!active) return null;
    return this.close(active, new Date(), 'user_logout');
  }

  /**
   * Force-closes a session left open past its own calendar day (a forgotten
   * clock-out, a crashed tab, etc.), backdating the logout to the end of that
   * day so the stale session doesn't block a fresh clock-in on a later day.
   */
  static async closeStale(session: EmployeeWorkSession, endOfDay: Date): Promise<EmployeeWorkSession | null> {
    return this.close(session, endOfDay, 'auto_closed');
  }

  /** An employee's sessions with login_at in [from, to), most recent first. */
  static async findInRange(employeeId: string, from: Date, to: Date): Promise<EmployeeWorkSession[]> {
    return db.query.employeeWorkSessions.findMany({
      where: and(
        eq(employeeWorkSessions.employeeId, employeeId),
        gte(employeeWorkSessions.loginAt, from),
        lt(employeeWorkSessions.loginAt, to),
      ),
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
