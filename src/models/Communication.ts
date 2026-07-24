import { db } from '../db';
import { communications, type Communication as DrizzleCommunication } from '../db/schema';
import { eq } from 'drizzle-orm';
import { decryptUserPII } from './User';

export type CommunicationInput = {
  title: string;
  body: string;
  requiresAcknowledgement?: boolean;
  deadlineAt?: Date | string | null;
  createdBy: number;
};

export class CommunicationModel {
  static async create(data: CommunicationInput): Promise<DrizzleCommunication> {
    const deadline = data.deadlineAt ? new Date(data.deadlineAt) : null;
    const [inserted] = await db
      .insert(communications)
      .values({
        title: data.title,
        body: data.body,
        requiresAcknowledgement: data.requiresAcknowledgement ?? false,
        deadlineAt: deadline,
        createdBy: data.createdBy,
      })
      .returning();
    if (!inserted) throw new Error('Failed to create communication');
    return inserted;
  }

  static async findById(id: number): Promise<DrizzleCommunication | null> {
    const record = await db.query.communications.findFirst({ where: eq(communications.id, id) });
    return record ?? null;
  }

  static async listAll() {
    const comms = await db.query.communications.findMany({
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      with: {
        recipients: {
          with: {
            user: true,
          },
        },
      },
    });

    return comms.map((comm) => {
      const totalRecipients = comm.recipients.length;
      let acknowledgedCount = 0;
      let onTimeCount = 0;
      let lateCount = 0;

      const recipientList = comm.recipients.map((r) => {
        const isAcknowledged = !!r.respondedAt;
        let isOnTime = false;
        let isLate = false;

        if (isAcknowledged) {
          acknowledgedCount++;
          if (comm.deadlineAt && new Date(r.respondedAt!) > new Date(comm.deadlineAt)) {
            isLate = true;
            lateCount++;
          } else {
            isOnTime = true;
            onTimeCount++;
          }
        }

        const u = r.user ? decryptUserPII(r.user) : null;

        return {
          id: r.id,
          userId: r.userId,
          name: u ? `${u.firstName} ${u.lastName}`.trim() : `User #${r.userId}`,
          email: u?.email || '',
          emailSentAt: r.emailSentAt,
          respondedAt: r.respondedAt,
          responseText: r.responseText,
          isAcknowledged,
          isOnTime,
          isLate,
        };
      });

      return {
        id: comm.id,
        title: comm.title,
        body: comm.body,
        requiresAcknowledgement: comm.requiresAcknowledgement,
        deadlineAt: comm.deadlineAt,
        createdBy: comm.createdBy,
        createdAt: comm.createdAt,
        totalRecipients,
        acknowledgedCount,
        onTimeCount,
        lateCount,
        pendingCount: totalRecipients - acknowledgedCount,
        recipients: recipientList,
      };
    });
  }

  static async delete(id: number): Promise<void> {
    await db.delete(communications).where(eq(communications.id, id));
  }
}
