import { db } from '../db';
import { communicationRecipients, communications, users, type CommunicationRecipient as DrizzleRecipient } from '../db/schema';
import { and, desc, eq } from 'drizzle-orm';

export class CommunicationRecipientModel {
  static async createMany(communicationId: number, userIds: number[]): Promise<DrizzleRecipient[]> {
    if (!userIds.length) return [];
    return db
      .insert(communicationRecipients)
      .values(userIds.map((userId) => ({ communicationId, userId })))
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
  static async listForUser(userId: number) {
    const rows = await db
      .select({
        id: communicationRecipients.id,
        communicationId: communicationRecipients.communicationId,
        userId: communicationRecipients.userId,
        emailSentAt: communicationRecipients.emailSentAt,
        respondedAt: communicationRecipients.respondedAt,
        responseText: communicationRecipients.responseText,
        title: communications.title,
        body: communications.body,
        createdAt: communications.createdAt,
      })
      .from(communicationRecipients)
      .innerJoin(communications, eq(communicationRecipients.communicationId, communications.id))
      .where(eq(communicationRecipients.userId, userId))
      .orderBy(desc(communicationRecipients.id));
    return rows;
  }

  static async findByCommunicationAndUser(communicationId: number, userId: number) {
    const record = await db.query.communicationRecipients.findFirst({
      where: and(eq(communicationRecipients.communicationId, communicationId), eq(communicationRecipients.userId, userId)),
    });
    return record ?? null;
  }

  static async markResponded(id: number, responseText?: string | null): Promise<void> {
    await db
      .update(communicationRecipients)
      .set({ respondedAt: new Date(), responseText: responseText ?? null })
      .where(eq(communicationRecipients.id, id));
  }

  /** Joined rows for the HR Manager Excel report. */
  static async getReportRows(communicationId?: number) {
    const rows = await db
      .select({
        title: communications.title,
        recipientName: users.firstName,
        recipientLastName: users.lastName,
        recipientEmail: users.email,
        emailSentAt: communicationRecipients.emailSentAt,
        respondedAt: communicationRecipients.respondedAt,
      })
      .from(communicationRecipients)
      .innerJoin(communications, eq(communicationRecipients.communicationId, communications.id))
      .innerJoin(users, eq(communicationRecipients.userId, users.id))
      .where(communicationId ? eq(communicationRecipients.communicationId, communicationId) : undefined);
    return rows;
  }
}
