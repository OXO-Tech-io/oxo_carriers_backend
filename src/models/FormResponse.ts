import { db } from '../db';
import {
  formResponses,
  formResponseAnswers,
  type FormResponse as DrizzleFormResponse,
  type FormResponseAnswer as DrizzleFormResponseAnswer,
} from '../db/schema';
import { and, eq } from 'drizzle-orm';

export type UpsertAnswerInput = {
  responseId: number;
  questionId: number;
  valueText?: string | null;
  value?: unknown;
};

export class FormResponseModel {
  static async createInProgress(formId: number, userId: number): Promise<DrizzleFormResponse> {
    const [response] = await db
      .insert(formResponses)
      .values({ formId, userId, status: 'in_progress', startedAt: new Date() })
      .returning();
    if (!response) throw new Error('Failed to create form response');
    return response;
  }

  static async markSubmitted(id: number, completionMs: number): Promise<DrizzleFormResponse | null> {
    await db
      .update(formResponses)
      .set({ status: 'submitted', submittedAt: new Date(), completionMs })
      .where(eq(formResponses.id, id));
    return this.findById(id);
  }

  static async findById(id: number): Promise<DrizzleFormResponse | null> {
    const record = await db.query.formResponses.findFirst({ where: eq(formResponses.id, id) });
    return record ?? null;
  }

  static async findByFormAndUser(formId: number, userId: number): Promise<DrizzleFormResponse | null> {
    const record = await db.query.formResponses.findFirst({
      where: and(eq(formResponses.formId, formId), eq(formResponses.userId, userId)),
    });
    return record ?? null;
  }

  static async listByFormId(formId: number): Promise<DrizzleFormResponse[]> {
    return db.query.formResponses.findMany({
      where: eq(formResponses.formId, formId),
      orderBy: (t, { desc }) => [desc(t.startedAt)],
    });
  }

  static async delete(id: number): Promise<void> {
    await db.delete(formResponses).where(eq(formResponses.id, id));
  }

  /** Upserts by (responseId, questionId) - autosave/resubmit updates the same answer row in place. */
  static async upsertAnswer(input: UpsertAnswerInput): Promise<DrizzleFormResponseAnswer> {
    const existing = await db.query.formResponseAnswers.findFirst({
      where: and(eq(formResponseAnswers.responseId, input.responseId), eq(formResponseAnswers.questionId, input.questionId)),
    });
    if (existing) {
      const [updated] = await db
        .update(formResponseAnswers)
        .set({ valueText: input.valueText ?? null, value: input.value ?? {} })
        .where(eq(formResponseAnswers.id, existing.id))
        .returning();
      if (!updated) throw new Error('Failed to update form response answer');
      return updated;
    }
    const [inserted] = await db
      .insert(formResponseAnswers)
      .values({
        responseId: input.responseId,
        questionId: input.questionId,
        valueText: input.valueText ?? null,
        value: input.value ?? {},
      })
      .returning();
    if (!inserted) throw new Error('Failed to create form response answer');
    return inserted;
  }

  static async listAnswersByResponseId(responseId: number): Promise<DrizzleFormResponseAnswer[]> {
    return db.query.formResponseAnswers.findMany({ where: eq(formResponseAnswers.responseId, responseId) });
  }

  static async getAnswerById(answerId: number): Promise<DrizzleFormResponseAnswer | null> {
    const record = await db.query.formResponseAnswers.findFirst({ where: eq(formResponseAnswers.id, answerId) });
    return record ?? null;
  }
}
