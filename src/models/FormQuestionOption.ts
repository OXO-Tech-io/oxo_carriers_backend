import { db } from '../db';
import { formQuestionOptions, type FormQuestionOption as DrizzleFormQuestionOption } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

export type FormQuestionOptionInput = {
  questionId: number;
  label: string;
  value: string;
  orderIndex: number;
  isOther?: boolean;
};

export class FormQuestionOptionModel {
  static async createMany(options: FormQuestionOptionInput[]): Promise<DrizzleFormQuestionOption[]> {
    if (!options.length) return [];
    return db
      .insert(formQuestionOptions)
      .values(options.map((o) => ({ ...o, isOther: o.isOther ?? false })))
      .returning();
  }

  static async create(option: FormQuestionOptionInput): Promise<DrizzleFormQuestionOption> {
    const [inserted] = await this.createMany([option]);
    if (!inserted) throw new Error('Failed to create form question option');
    return inserted;
  }

  static async listByQuestionId(questionId: number): Promise<DrizzleFormQuestionOption[]> {
    return db.query.formQuestionOptions.findMany({
      where: eq(formQuestionOptions.questionId, questionId),
      orderBy: (t, { asc }) => [asc(t.orderIndex)],
    });
  }

  /** Loads options for many questions in one flat query, avoiding an N+1 (see formService.getFormWithGraph). */
  static async listByQuestionIds(questionIds: number[]): Promise<DrizzleFormQuestionOption[]> {
    if (!questionIds.length) return [];
    return db.query.formQuestionOptions.findMany({
      where: inArray(formQuestionOptions.questionId, questionIds),
      orderBy: (t, { asc }) => [asc(t.orderIndex)],
    });
  }

  static async update(
    id: number,
    patch: Partial<Pick<FormQuestionOptionInput, 'label' | 'value' | 'orderIndex' | 'isOther'>>
  ): Promise<void> {
    await db.update(formQuestionOptions).set(patch).where(eq(formQuestionOptions.id, id));
  }

  static async deleteMany(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await db.delete(formQuestionOptions).where(inArray(formQuestionOptions.id, ids));
  }

  static async deleteByQuestionId(questionId: number): Promise<void> {
    await db.delete(formQuestionOptions).where(eq(formQuestionOptions.questionId, questionId));
  }
}
