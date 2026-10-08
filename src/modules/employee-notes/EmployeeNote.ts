import { db } from '../../db';
import { employeeNotes, type EmployeeNote as DrizzleEmployeeNote } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type EmployeeNoteInput = {
  employeeId: string;
  authorUserId: number;
  content: string;
};

export class EmployeeNoteModel {
  static async create(data: EmployeeNoteInput): Promise<DrizzleEmployeeNote> {
    const [inserted] = await db.insert(employeeNotes).values(data).returning();
    if (!inserted) throw new Error('Failed to create employee note');
    return inserted;
  }

  static async findById(id: number): Promise<DrizzleEmployeeNote | null> {
    const record = await db.query.employeeNotes.findFirst({ where: eq(employeeNotes.id, id) });
    return record ?? null;
  }

  static async listByEmployeeId(employeeId: string): Promise<DrizzleEmployeeNote[]> {
    return db.query.employeeNotes.findMany({
      where: eq(employeeNotes.employeeId, employeeId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }

  static async update(id: number, content: string): Promise<DrizzleEmployeeNote | null> {
    await db
      .update(employeeNotes)
      .set({ content, updatedAt: new Date() })
      .where(eq(employeeNotes.id, id));
    return this.findById(id);
  }
}
