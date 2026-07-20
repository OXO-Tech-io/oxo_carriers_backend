import { db } from '../db';
import { eventParticipants, type EventParticipant as DrizzleEventParticipant } from '../db/schema';
import { and, eq } from 'drizzle-orm';

export class EventParticipantModel {
  static async listByEventId(eventId: number): Promise<DrizzleEventParticipant[]> {
    return db.query.eventParticipants.findMany({ where: eq(eventParticipants.eventId, eventId) });
  }

  /** Upsert-by-application-logic: one row per (eventId, userId). */
  static async recordParticipation(
    eventId: number,
    userId: number,
    participated: boolean,
    recordedBy: number,
    willParticipate?: boolean | null
  ): Promise<DrizzleEventParticipant> {
    const existing = await db.query.eventParticipants.findFirst({
      where: and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)),
    });

    if (existing) {
      const [updated] = await db
        .update(eventParticipants)
        .set({ participated, willParticipate, recordedBy, recordedAt: new Date() })
        .where(eq(eventParticipants.id, existing.id))
        .returning();
      if (!updated) throw new Error('Failed to update event participation');
      return updated;
    }

    const [inserted] = await db
      .insert(eventParticipants)
      .values({ eventId, userId, participated, willParticipate, recordedBy })
      .returning();
    if (!inserted) throw new Error('Failed to record event participation');
    return inserted;
  }
}
