import { db } from '../db';
import { events, type Event as DrizzleEvent } from '../db/schema';
import { eq } from 'drizzle-orm';

export type EventInput = {
  name: string;
  description?: string | null;
  eventDate: Date;
  location?: string | null;
  createdBy: number;
};

export class EventModel {
  static async create(data: EventInput): Promise<DrizzleEvent> {
    const [inserted] = await db.insert(events).values(data).returning();
    if (!inserted) throw new Error('Failed to create event');
    return inserted;
  }

  static async findById(id: number): Promise<DrizzleEvent | null> {
    const record = await db.query.events.findFirst({ where: eq(events.id, id) });
    return record ?? null;
  }

  static async listAll(): Promise<DrizzleEvent[]> {
    return db.query.events.findMany({ orderBy: (t, { desc }) => [desc(t.eventDate)] });
  }
}
