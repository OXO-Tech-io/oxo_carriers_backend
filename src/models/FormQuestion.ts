import { db } from '../db';
import { formQuestions, type FormQuestion as DrizzleFormQuestion } from '../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { cleanPatch } from './formPatchUtil';

export type FormQuestionInput = {
  formId: number;
  sectionId?: number | null;
  type: string;
  title: string;
  description?: string | null;
  helpText?: string | null;
  placeholder?: string | null;
  required: boolean;
  orderIndex: number;
  config: Record<string, unknown>;
  defaultValue?: unknown;
};

export class FormQuestionModel {
  static async create(input: FormQuestionInput): Promise<DrizzleFormQuestion> {
    const [inserted] = await db
      .insert(formQuestions)
      .values({
        formId: input.formId,
        sectionId: input.sectionId ?? null,
        type: input.type as DrizzleFormQuestion['type'],
        title: input.title,
        description: input.description ?? null,
        helpText: input.helpText ?? null,
        placeholder: input.placeholder ?? null,
        required: input.required,
        orderIndex: input.orderIndex,
        config: input.config,
        defaultValue: input.defaultValue ?? null,
      })
      .returning();
    if (!inserted) throw new Error('Failed to create form question');
    return inserted;
  }

  static async countByFormId(formId: number): Promise<number> {
    const rows = await db.query.formQuestions.findMany({ where: eq(formQuestions.formId, formId) });
    return rows.length;
  }

  /** See FormSectionModel.nextOrderIndex - same count-goes-stale-after-delete/race rationale. */
  static async nextOrderIndex(formId: number): Promise<number> {
    const [row] = await db
      .select({ maxOrder: sql<number | null>`max(${formQuestions.orderIndex})` })
      .from(formQuestions)
      .where(eq(formQuestions.formId, formId));
    return (row?.maxOrder ?? -1) + 1;
  }

  static async findById(id: number): Promise<DrizzleFormQuestion | null> {
    const record = await db.query.formQuestions.findFirst({ where: eq(formQuestions.id, id) });
    return record ?? null;
  }

  static async listByFormId(formId: number): Promise<DrizzleFormQuestion[]> {
    return db.query.formQuestions.findMany({
      where: eq(formQuestions.formId, formId),
      orderBy: (t, { asc }) => [asc(t.orderIndex), asc(t.id)],
    });
  }

  static async listByIds(ids: number[]): Promise<DrizzleFormQuestion[]> {
    if (!ids.length) return [];
    return db.query.formQuestions.findMany({ where: inArray(formQuestions.id, ids) });
  }

  static async update(
    id: number,
    patch: Partial<Omit<FormQuestionInput, 'formId' | 'orderIndex'>>
  ): Promise<DrizzleFormQuestion | null> {
    const cleaned = cleanPatch(patch as Record<string, unknown>);
    if (Object.keys(cleaned).length) {
      await db.update(formQuestions).set(cleaned).where(eq(formQuestions.id, id));
    }
    return this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    await db.delete(formQuestions).where(eq(formQuestions.id, id));
  }

  static async reorder(formId: number, questionIds: number[], sectionId?: number | null): Promise<void> {
    await Promise.all(
      questionIds.map((id, orderIndex) =>
        db
          .update(formQuestions)
          .set({ orderIndex, ...(sectionId !== undefined ? { sectionId } : {}) })
          .where(and(eq(formQuestions.id, id), eq(formQuestions.formId, formId)))
      )
    );
  }
}
