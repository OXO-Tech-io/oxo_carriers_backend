import { db } from '../../db';
import { communications, type Communication as DrizzleCommunication } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type CommunicationInput = {
  title: string;
  body: string;
  createdBy: number;
  requiresAcknowledgement?: boolean;
  deadlineAt?: Date | null;
};

export class CommunicationModel {
  static async create(data: CommunicationInput): Promise<DrizzleCommunication> {
    const [inserted] = await db.insert(communications).values(data).returning();
    if (!inserted) throw new Error('Failed to create communication');
    return inserted;
  }

  static async findById(id: number): Promise<DrizzleCommunication | null> {
    const record = await db.query.communications.findFirst({ where: eq(communications.id, id) });
    return record ?? null;
  }

  static async listAll(): Promise<DrizzleCommunication[]> {
    return db.query.communications.findMany({ orderBy: (t, { desc }) => [desc(t.createdAt)] });
  }

  // Recipients cascade at the DB level (tbl_communication_recipients FK); attachments
  // are polymorphic (no FK) and must be deleted separately by the caller.
  static async deleteById(id: number): Promise<void> {
    await db.delete(communications).where(eq(communications.id, id));
  }
}
