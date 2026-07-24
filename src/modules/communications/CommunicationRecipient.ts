import { db } from '../../db';
import { communicationRecipients, communications, employee as users, type CommunicationRecipient as DrizzleRecipient } from '../../db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { EmployeeModel } from '../../employees/Employee';

export class CommunicationRecipientModel {
  static async createMany(communicationId: number, employeeIds: string[]): Promise<DrizzleRecipient[]> {
    if (!employeeIds.length) return [];
    return db
      .insert(communicationRecipients)
      .values(employeeIds.map((employeeId) => ({ communicationId, employeeId })))
      .returning();
  }

  static async markEmailSent(id: number): Promise<void> {
    await db.update(communicationRecipients).set({ emailSentAt: new Date() }).where(eq(communicationRecipients.id, id));
  }

  static async listByCommunicationId(communicationId: number) {
    return db.query.communicationRecipients.findMany({
      where: eq(communicationRecipients.communicationId, communicationId),
    });
  }

  /** Joined with the parent communication so the recipient-facing UI can show title/body. */
  static async listForUser(employeeId: string) {
    const rows = await db
      .select({
        id: communicationRecipients.id,
        communicationId: communicationRecipients.communicationId,
        employeeId: communicationRecipients.employeeId,
        emailSentAt: communicationRecipients.emailSentAt,
        respondedAt: communicationRecipients.respondedAt,
        responseText: communicationRecipients.responseText,
        title: communications.title,
        body: communications.body,
        createdAt: communications.createdAt,
      })
      .from(communicationRecipients)
      .innerJoin(communications, eq(communicationRecipients.communicationId, communications.id))
      .where(eq(communicationRecipients.employeeId, employeeId))
      .orderBy(desc(communicationRecipients.id));
    return rows;
  }

  static async findByCommunicationAndUser(communicationId: number, employeeId: string) {
    const record = await db.query.communicationRecipients.findFirst({
      where: and(eq(communicationRecipients.communicationId, communicationId), eq(communicationRecipients.employeeId, employeeId)),
    });
    return record ?? null;
  }

  static async markResponded(id: number, responseText?: string | null): Promise<void> {
    await db
      .update(communicationRecipients)
      .set({ respondedAt: new Date(), responseText: responseText ?? null })
      .where(eq(communicationRecipients.id, id));
  }

  /** Joined rows for the HR Manager Excel report. firstName/lastName/email
   * are encrypted - can't be selected in SQL, so they're batch-resolved and
   * stitched in afterward. */
  static async getReportRows(communicationId?: number) {
    const rows = await db
      .select({
        title: communications.title,
        employeeId: users.employeeId,
        emailSentAt: communicationRecipients.emailSentAt,
        respondedAt: communicationRecipients.respondedAt,
      })
      .from(communicationRecipients)
      .innerJoin(communications, eq(communicationRecipients.communicationId, communications.id))
      .innerJoin(users, eq(communicationRecipients.employeeId, users.employeeId))
      .where(communicationId ? eq(communicationRecipients.communicationId, communicationId) : undefined);

    const employeeMap = await EmployeeModel.findByEmployeeIds(rows.map((r) => r.employeeId));
    return rows.map((row) => {
      const emp = row.employeeId ? employeeMap.get(row.employeeId) : undefined;
      return {
        title: row.title,
        recipientName: emp?.firstName ?? '',
        recipientLastName: emp?.lastName ?? '',
        recipientEmail: emp?.email ?? '',
        emailSentAt: row.emailSentAt,
        respondedAt: row.respondedAt,
      };
    });
  }
}
