import { db } from '../../db';
import {
  formResponses,
  formResponseAnswers,
  type FormResponse as DrizzleFormResponse,
  type FormResponseAnswer as DrizzleFormResponseAnswer,
} from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { EmployeeModel } from '../../employees/Employee';

export type SubmitAnswerInput = {
  questionId: number;
  value: unknown;
  valueText: string | null;
};

export class FormResponseModel {
  // `userId` is the numeric tbl_employee.id used throughout the Forms API;
  // tbl_form_responses stores the business employee_id (varchar) FK, so it is
  // resolved via EmployeeModel before being persisted/queried.
  static async findOrCreate(formId: number, userId: number): Promise<DrizzleFormResponse> {
    const employee = await EmployeeModel.findById(userId);
    if (!employee?.employeeId) throw new Error('Employee has no employee_id assigned');
    const employeeId = employee.employeeId;

    const existing = await db.query.formResponses.findFirst({
      where: and(eq(formResponses.formId, formId), eq(formResponses.employeeId, employeeId)),
    });
    if (existing) return existing;

    const [created] = await db.insert(formResponses).values({ formId, employeeId }).returning();
    if (!created) throw new Error('Failed to create form response');
    return created;
  }

  static async findByFormAndUser(formId: number, userId: number): Promise<DrizzleFormResponse | null> {
    const employee = await EmployeeModel.findById(userId);
    if (!employee?.employeeId) return null;
    const record = await db.query.formResponses.findFirst({
      where: and(eq(formResponses.formId, formId), eq(formResponses.employeeId, employee.employeeId)),
    });
    return record ?? null;
  }

  static async listByFormId(formId: number): Promise<DrizzleFormResponse[]> {
    return db.query.formResponses.findMany({
      where: eq(formResponses.formId, formId),
      orderBy: (t, { desc }) => [desc(t.submittedAt)],
    });
  }

  static async listAnswersByResponseId(responseId: number): Promise<DrizzleFormResponseAnswer[]> {
    return db.query.formResponseAnswers.findMany({ where: eq(formResponseAnswers.responseId, responseId) });
  }

  static async getAnswerById(answerId: number): Promise<DrizzleFormResponseAnswer | null> {
    const record = await db.query.formResponseAnswers.findFirst({ where: eq(formResponseAnswers.id, answerId) });
    return record ?? null;
  }

  // The frontend always sends the full current answer set (autosave and real
  // submit alike), so each call replaces every existing answer for this
  // response rather than diffing. Callers must clean up any attachments
  // belonging to the old answers (via AttachmentModel.deleteByEntity) BEFORE
  // calling this, since those answer rows are about to be deleted.
  static async replaceAnswers(responseId: number, answers: SubmitAnswerInput[]): Promise<DrizzleFormResponseAnswer[]> {
    return db.transaction(async (tx) => {
      await tx.delete(formResponseAnswers).where(eq(formResponseAnswers.responseId, responseId));
      if (!answers.length) return [];
      return tx
        .insert(formResponseAnswers)
        .values(
          answers.map((a) => ({
            responseId,
            questionId: a.questionId,
            value: a.value,
            valueText: a.valueText,
          })),
        )
        .returning();
    });
  }

  static async markSubmitted(responseId: number, completionMs: number): Promise<void> {
    await db
      .update(formResponses)
      .set({ status: 'submitted', submittedAt: new Date(), completionMs })
      .where(eq(formResponses.id, responseId));
  }
}
