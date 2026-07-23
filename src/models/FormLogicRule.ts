import { db } from '../db';
import { formLogicRules, type FormLogicRule as DrizzleFormLogicRule } from '../db/schema';
import { eq } from 'drizzle-orm';
import { cleanPatch } from './formPatchUtil';

export type FormLogicRuleInput = {
  formId: number;
  targetQuestionId: number;
  sourceQuestionId: number;
  comparator: string;
  comparisonValue?: unknown;
  action: string;
  combinator: string;
  orderIndex: number;
};

export class FormLogicRuleModel {
  static async create(input: FormLogicRuleInput): Promise<DrizzleFormLogicRule> {
    const [inserted] = await db
      .insert(formLogicRules)
      .values({
        formId: input.formId,
        targetQuestionId: input.targetQuestionId,
        sourceQuestionId: input.sourceQuestionId,
        comparator: input.comparator as DrizzleFormLogicRule['comparator'],
        comparisonValue: input.comparisonValue ?? null,
        action: input.action as DrizzleFormLogicRule['action'],
        combinator: input.combinator as DrizzleFormLogicRule['combinator'],
        orderIndex: input.orderIndex,
      })
      .returning();
    if (!inserted) throw new Error('Failed to create form logic rule');
    return inserted;
  }

  static async countByFormId(formId: number): Promise<number> {
    const rows = await db.query.formLogicRules.findMany({ where: eq(formLogicRules.formId, formId) });
    return rows.length;
  }

  static async findById(id: number): Promise<DrizzleFormLogicRule | null> {
    const record = await db.query.formLogicRules.findFirst({ where: eq(formLogicRules.id, id) });
    return record ?? null;
  }

  static async listByFormId(formId: number): Promise<DrizzleFormLogicRule[]> {
    return db.query.formLogicRules.findMany({
      where: eq(formLogicRules.formId, formId),
      orderBy: (t, { asc }) => [asc(t.orderIndex)],
    });
  }

  static async update(
    id: number,
    patch: Partial<Pick<FormLogicRuleInput, 'comparator' | 'comparisonValue' | 'action' | 'combinator'>>
  ): Promise<DrizzleFormLogicRule | null> {
    const cleaned = cleanPatch(patch as Record<string, unknown>);
    if (Object.keys(cleaned).length) {
      await db.update(formLogicRules).set(cleaned).where(eq(formLogicRules.id, id));
    }
    return this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    await db.delete(formLogicRules).where(eq(formLogicRules.id, id));
  }
}
