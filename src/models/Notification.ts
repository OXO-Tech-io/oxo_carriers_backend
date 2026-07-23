import { db } from '../db';
import { notifications, type Notification as DrizzleNotification } from '../db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

export type NotificationInput = {
  employeeId: string;
  type: string;
  title: string;
  message: string;
  payload?: unknown;
  link?: string | null;
};

export class NotificationModel {
  static async create(data: NotificationInput): Promise<DrizzleNotification> {
    const [inserted] = await db.insert(notifications).values(data).returning();
    if (!inserted) throw new Error('Failed to create notification');
    return inserted;
  }

  static async listByEmployeeId(
    employeeId: string,
    filters?: { isRead?: boolean; limit?: number; offset?: number }
  ): Promise<DrizzleNotification[]> {
    const conditions = [eq(notifications.employeeId, employeeId)];
    if (filters?.isRead !== undefined) {
      conditions.push(eq(notifications.isRead, filters.isRead));
    }
    return db.query.notifications.findMany({
      where: and(...conditions),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: filters?.limit ?? 20,
      offset: filters?.offset ?? 0,
    });
  }

  static async countUnread(employeeId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.employeeId, employeeId), eq(notifications.isRead, false)));
    return Number(result[0]?.count ?? 0);
  }

  static async markRead(id: number, employeeId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.employeeId, employeeId)));
  }

  static async markAllRead(employeeId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.employeeId, employeeId), eq(notifications.isRead, false)));
  }
}
