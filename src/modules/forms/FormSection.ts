import { db } from '../../db';
import { formSections, type FormSection as DrizzleFormSection } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type FormSectionInput = {
  title?: string;
  description?: string | null;
};

export class FormSectionModel {
  static async create(formId: number, input: FormSectionInput): Promise<DrizzleFormSection> {
    const maxOrder = await db.query.formSections.findMany({
      where: eq(formSections.formId, formId),
      orderBy: (t, { desc }) => [desc(t.orderIndex)],
      limit: 1,
    });
    const orderIndex = (maxOrder[0]?.orderIndex ?? -1) + 1;
    const [section] = await db
      .insert(formSections)
      .values({ formId, title: input.title?.trim() || 'New section', description: input.description ?? null, orderIndex })
      .returning();
    if (!section) throw new Error('Failed to create section');
    return section;
  }

  static async findById(id: number): Promise<DrizzleFormSection | null> {
    const record = await db.query.formSections.findFirst({ where: eq(formSections.id, id) });
    return record ?? null;
  }

  static async listByFormId(formId: number): Promise<DrizzleFormSection[]> {
    return db.query.formSections.findMany({
      where: eq(formSections.formId, formId),
      orderBy: (t, { asc }) => [asc(t.orderIndex)],
    });
  }

  static async update(id: number, patch: FormSectionInput): Promise<DrizzleFormSection | null> {
    await db.update(formSections).set(patch).where(eq(formSections.id, id));
    return this.findById(id);
  }

  static async deleteById(id: number): Promise<void> {
    await db.delete(formSections).where(eq(formSections.id, id));
  }

  static async reorder(sectionIds: number[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < sectionIds.length; i++) {
        await tx.update(formSections).set({ orderIndex: i }).where(eq(formSections.id, sectionIds[i]));
      }
    });
  }
}
