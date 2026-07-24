import { db } from '../../db';
import {
  formResponses,
  formResponseAnswers,
  type FormResponse as DrizzleFormResponse,
  type FormResponseAnswer as DrizzleFormResponseAnswer,
  type NewFormResponseAnswer,
} from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { EmployeeModel } from '../../employees/Employee';

export type SubmitAnswerInput = {
  fieldId: number;
  valueText?: string | null;
};

export class FormResponseModel {
  // `userId` is the numeric tbl_employee.id used throughout the Forms API;
  // tbl_form_responses stores the business employee_id (varchar) FK, so it is
  // resolved via EmployeeModel before being persisted/queried.
  static async create(formId: number, userId: number, answers: SubmitAnswerInput[]): Promise<DrizzleFormResponse> {
    const employee = await EmployeeModel.findById(userId);
    if (!employee?.employeeId) throw new Error('Employee has no employee_id assigned');
    const employeeId = employee.employeeId;

    return db.transaction(async (tx) => {
      const [response] = await tx.insert(formResponses).values({ formId, employeeId }).returning();
      if (!response) throw new Error('Failed to create form response');

      const answerRows: NewFormResponseAnswer[] = answers.map((a) => ({
        responseId: response.id,
        fieldId: a.fieldId,
        valueText: a.valueText ?? null,
      }));
      if (answerRows.length) {
        await tx.insert(formResponseAnswers).values(answerRows).returning();
      }
      return response;
    });
  }

  /** File-type answers are added after `create()` once the file has been saved to disk. */
  static async addFileAnswer(responseId: number, fieldId: number): Promise<DrizzleFormResponseAnswer> {
    const [answer] = await db.insert(formResponseAnswers).values({ responseId, fieldId, valueText: null }).returning();
    if (!answer) throw new Error('Failed to create form response file answer');
    return answer;
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
}
