import { db } from '../db';
import { formSections, type FormSection as DrizzleFormSection } from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { cleanPatch } from './formPatchUtil';

export type FormSectionInput = {
  formId: number;
  title: string;
  description?: string | null;
  orderIndex: number;
};

export class FormSectionModel {
  static async create(input: FormSectionInput): Promise<DrizzleFormSection> {
    const [inserted] = await db.insert(formSections).values(input).returning();
    if (!inserted) throw new Error('Failed to create form section');
    return inserted;
  }

  /**
   * `MAX(orderIndex) + 1` rather than a row count - a count goes stale (and collides with an
   * existing orderIndex) once any section has been deleted, and two concurrent creates reading
   * the same count both land on the same orderIndex, leaving one section's position ambiguous.
   */
  static async nextOrderIndex(formId: number): Promise<number> {
    const [row] = await db
      .select({ maxOrder: sql<number | null>`max(${formSections.orderIndex})` })
      .from(formSections)
      .where(eq(formSections.formId, formId));
    return (row?.maxOrder ?? -1) + 1;
  }

  static async findById(id: number): Promise<DrizzleFormSection | null> {
    const record = await db.query.formSections.findFirst({ where: eq(formSections.id, id) });
    return record ?? null;
  }

  static async listByFormId(formId: number): Promise<DrizzleFormSection[]> {
    return db.query.formSections.findMany({
      where: eq(formSections.formId, formId),
      orderBy: (t, { asc }) => [asc(t.orderIndex), asc(t.id)],
    });
  }

  static async update(
    id: number,
    patch: Partial<Pick<FormSectionInput, 'title' | 'description'>>
  ): Promise<DrizzleFormSection | null> {
    const cleaned = cleanPatch(patch);
    if (Object.keys(cleaned).length) {
      await db.update(formSections).set(cleaned).where(eq(formSections.id, id));
    }
    return this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    await db.delete(formSections).where(eq(formSections.id, id));
  }

  static async reorder(formId: number, sectionIds: number[]): Promise<void> {
    await Promise.all(
      sectionIds.map((id, orderIndex) =>
        db.update(formSections).set({ orderIndex }).where(and(eq(formSections.id, id), eq(formSections.formId, formId)))
      )
    );
  }
}
