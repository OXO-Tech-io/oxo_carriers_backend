import { db } from '../../db';
import { formLogicRules, type FormLogicRule as DrizzleFormLogicRule } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type FormLogicRuleInput = {
  targetQuestionId: number;
  sourceQuestionId: number;
  comparator: DrizzleFormLogicRule['comparator'];
  comparisonValue?: unknown;
  action?: DrizzleFormLogicRule['action'];
  combinator?: DrizzleFormLogicRule['combinator'];
};

export class FormLogicRuleModel {
  static async create(formId: number, input: FormLogicRuleInput): Promise<DrizzleFormLogicRule> {
    const maxOrder = await db.query.formLogicRules.findMany({
      where: eq(formLogicRules.formId, formId),
      orderBy: (t, { desc }) => [desc(t.orderIndex)],
      limit: 1,
    });
    const orderIndex = (maxOrder[0]?.orderIndex ?? -1) + 1;
    const [rule] = await db
      .insert(formLogicRules)
      .values({
        formId,
        targetQuestionId: input.targetQuestionId,
        sourceQuestionId: input.sourceQuestionId,
        comparator: input.comparator,
        comparisonValue: input.comparisonValue ?? null,
        action: input.action ?? 'show',
        combinator: input.combinator ?? 'all',
        orderIndex,
      })
      .returning();
    if (!rule) throw new Error('Failed to create logic rule');
    return rule;
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
    patch: Partial<Pick<FormLogicRuleInput, 'sourceQuestionId' | 'comparator' | 'comparisonValue' | 'action' | 'combinator'>>,
  ): Promise<DrizzleFormLogicRule | null> {
    await db.update(formLogicRules).set(patch).where(eq(formLogicRules.id, id));
    return this.findById(id);
  }

  static async deleteById(id: number): Promise<void> {
    await db.delete(formLogicRules).where(eq(formLogicRules.id, id));
  }
}
