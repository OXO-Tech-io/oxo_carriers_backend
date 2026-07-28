import { db } from '../../db';
import {
  formQuestions,
  formQuestionOptions,
  type FormQuestion as DrizzleFormQuestion,
  type FormQuestionOption as DrizzleFormQuestionOption,
} from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';

export type FormQuestionType = DrizzleFormQuestion['type'];

export type FormQuestionOptionInput = {
  id?: number;
  label: string;
  value: string;
  isOther?: boolean;
};

export type FormQuestionInput = {
  sectionId?: number | null;
  type: FormQuestionType;
  title?: string;
  description?: string | null;
  helpText?: string | null;
  placeholder?: string | null;
  required?: boolean;
  config?: unknown;
  defaultValue?: unknown;
  options?: FormQuestionOptionInput[];
};

export interface QuestionWithOptions extends DrizzleFormQuestion {
  options: DrizzleFormQuestionOption[];
}

export class FormQuestionModel {
  static async create(formId: number, input: FormQuestionInput): Promise<QuestionWithOptions> {
    return db.transaction(async (tx) => {
      const maxOrder = await tx.query.formQuestions.findMany({
        where: eq(formQuestions.formId, formId),
        orderBy: (t, { desc }) => [desc(t.orderIndex)],
        limit: 1,
      });
      const orderIndex = (maxOrder[0]?.orderIndex ?? -1) + 1;

      const [question] = await tx
        .insert(formQuestions)
        .values({
          formId,
          sectionId: input.sectionId ?? null,
          type: input.type,
          title: input.title ?? '',
          description: input.description ?? null,
          helpText: input.helpText ?? null,
          placeholder: input.placeholder ?? null,
          required: input.required ?? false,
          orderIndex,
          // Never null - the frontend's FormQuestion.config type is a plain
          // Record<string, unknown>, and QuestionEditor.tsx reads
          // question.config['columns'] unconditionally for every question.
          config: input.config ?? {},
          defaultValue: input.defaultValue ?? null,
        })
        .returning();
      if (!question) throw new Error('Failed to create question');

      let options: DrizzleFormQuestionOption[] = [];
      if (input.options?.length) {
        options = await tx
          .insert(formQuestionOptions)
          .values(
            input.options.map((o, i) => ({
              questionId: question.id,
              label: o.label,
              value: o.value,
              orderIndex: i,
              isOther: o.isOther ?? false,
            })),
          )
          .returning();
      }

      return { ...question, options };
    });
  }

  static async findById(id: number): Promise<QuestionWithOptions | null> {
    const question = await db.query.formQuestions.findFirst({ where: eq(formQuestions.id, id) });
    if (!question) return null;
    const options = await this.listOptions(id);
    return { ...question, options };
  }

  static async listOptions(questionId: number): Promise<DrizzleFormQuestionOption[]> {
    return db.query.formQuestionOptions.findMany({
      where: eq(formQuestionOptions.questionId, questionId),
      orderBy: (t, { asc }) => [asc(t.orderIndex)],
    });
  }

  static async listByFormId(formId: number): Promise<QuestionWithOptions[]> {
    const questions = await db.query.formQuestions.findMany({
      where: eq(formQuestions.formId, formId),
      orderBy: (t, { asc }) => [asc(t.orderIndex)],
    });
    if (!questions.length) return [];
    const allOptions = await db.query.formQuestionOptions.findMany({
      where: inArray(
        formQuestionOptions.questionId,
        questions.map((q) => q.id),
      ),
      orderBy: (t, { asc }) => [asc(t.orderIndex)],
    });
    const optionsByQuestion = new Map<number, DrizzleFormQuestionOption[]>();
    for (const o of allOptions) {
      const list = optionsByQuestion.get(o.questionId) ?? [];
      list.push(o);
      optionsByQuestion.set(o.questionId, list);
    }
    return questions.map((q) => ({ ...q, options: optionsByQuestion.get(q.id) ?? [] }));
  }

  // Replaces the question's options wholesale, matching options that carry an
  // existing id (update in place) and inserting the rest (fresh options, or
  // ones carrying a frontend-local negative placeholder id) - anything not
  // present in the incoming set is deleted. Returned in the same order as
  // `options` so the caller can reconcile placeholder ids with real ones.
  static async update(
    id: number,
    patch: Partial<Omit<FormQuestionInput, 'options'>> & { options?: FormQuestionOptionInput[] },
  ): Promise<QuestionWithOptions | null> {
    return db.transaction(async (tx) => {
      const { options, ...scalarPatch } = patch;
      if (Object.keys(scalarPatch).length) {
        await tx.update(formQuestions).set(scalarPatch).where(eq(formQuestions.id, id));
      }

      let finalOptions: DrizzleFormQuestionOption[] = [];
      if (options) {
        const existing = await tx.query.formQuestionOptions.findMany({ where: eq(formQuestionOptions.questionId, id) });
        const keepIds = new Set(options.filter((o) => o.id && o.id > 0).map((o) => o.id as number));
        const toDelete = existing.filter((o) => !keepIds.has(o.id)).map((o) => o.id);
        if (toDelete.length) {
          await tx.delete(formQuestionOptions).where(inArray(formQuestionOptions.id, toDelete));
        }

        for (let i = 0; i < options.length; i++) {
          const o = options[i];
          if (o.id && o.id > 0 && keepIds.has(o.id)) {
            const [updated] = await tx
              .update(formQuestionOptions)
              .set({ label: o.label, value: o.value, orderIndex: i, isOther: o.isOther ?? false })
              .where(eq(formQuestionOptions.id, o.id))
              .returning();
            if (updated) finalOptions.push(updated);
          } else {
            const [inserted] = await tx
              .insert(formQuestionOptions)
              .values({ questionId: id, label: o.label, value: o.value, orderIndex: i, isOther: o.isOther ?? false })
              .returning();
            if (inserted) finalOptions.push(inserted);
          }
        }
      } else {
        finalOptions = await tx.query.formQuestionOptions.findMany({
          where: eq(formQuestionOptions.questionId, id),
          orderBy: (t, { asc }) => [asc(t.orderIndex)],
        });
      }

      const question = await tx.query.formQuestions.findFirst({ where: eq(formQuestions.id, id) });
      if (!question) return null;
      return { ...question, options: finalOptions };
    });
  }

  static async deleteById(id: number): Promise<void> {
    await db.delete(formQuestions).where(eq(formQuestions.id, id));
  }

  static async reorder(questionIds: number[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < questionIds.length; i++) {
        await tx.update(formQuestions).set({ orderIndex: i }).where(eq(formQuestions.id, questionIds[i]));
      }
    });
  }
}
