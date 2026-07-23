import { db } from '../db';
import { forms, type Form as DrizzleForm } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

export type FormInput = {
  title: string;
  description?: string | null;
  createdBy: number;
};

export class FormModel {
  static async create(form: FormInput): Promise<DrizzleForm> {
    const [inserted] = await db.insert(forms).values(form).returning();
    if (!inserted) throw new Error('Failed to create form');
    return inserted;
  }

  static async findById(id: number): Promise<DrizzleForm | null> {
    const record = await db.query.forms.findFirst({ where: eq(forms.id, id) });
    return record ?? null;
  }

  static async listAll(): Promise<DrizzleForm[]> {
    return db.query.forms.findMany({ orderBy: (t, { desc }) => [desc(t.createdAt)] });
  }

  static async update(id: number, patch: { title?: string; description?: string | null }): Promise<DrizzleForm | null> {
    await db
      .update(forms)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(forms.id, id));
    return this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    await db.delete(forms).where(eq(forms.id, id));
  }

  static async publish(id: number): Promise<DrizzleForm | null> {
    await db.update(forms).set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() }).where(eq(forms.id, id));
    return this.findById(id);
  }

  static async unpublish(id: number): Promise<DrizzleForm | null> {
    await db.update(forms).set({ status: 'closed', updatedAt: new Date() }).where(eq(forms.id, id));
    return this.findById(id);
  }

  static async archive(id: number): Promise<DrizzleForm | null> {
    await db.update(forms).set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() }).where(eq(forms.id, id));
    return this.findById(id);
  }

  /** Atomic increment - called once per newly-submitted (not resubmitted) response. */
  static async incrementResponseCount(id: number): Promise<void> {
    await db
      .update(forms)
      .set({ responseCount: sql`${forms.responseCount} + 1`, lastResponseAt: new Date() })
      .where(eq(forms.id, id));
  }
}
