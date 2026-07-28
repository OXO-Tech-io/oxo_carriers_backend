import { db } from '../../db';
import {
  forms,
  formSections,
  formQuestions,
  formQuestionOptions,
  formLogicRules,
  formSettings,
  formTheme,
  type Form as DrizzleForm,
} from '../../db/schema';
import { eq, sql } from 'drizzle-orm';

export type FormInput = {
  title: string;
  description?: string | null;
  createdBy: number;
};

export class FormModel {
  static async create(input: FormInput): Promise<DrizzleForm> {
    return db.transaction(async (tx) => {
      const [form] = await tx
        .insert(forms)
        .values({ title: input.title, description: input.description ?? null, createdBy: input.createdBy })
        .returning();
      if (!form) throw new Error('Failed to create form');
      await tx.insert(formSettings).values({ formId: form.id });
      await tx.insert(formTheme).values({ formId: form.id });
      return form;
    });
  }

  static async update(id: number, patch: { title?: string; description?: string | null }): Promise<DrizzleForm | null> {
    await db.update(forms).set({ ...patch, updatedAt: new Date() }).where(eq(forms.id, id));
    return this.findById(id);
  }

  static async findById(id: number): Promise<DrizzleForm | null> {
    const record = await db.query.forms.findFirst({ where: eq(forms.id, id) });
    return record ?? null;
  }

  static async listAll(): Promise<DrizzleForm[]> {
    return db.query.forms.findMany({ orderBy: (t, { desc }) => [desc(t.createdAt)] });
  }

  static async publish(id: number): Promise<DrizzleForm | null> {
    await db
      .update(forms)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(forms.id, id));
    return this.findById(id);
  }

  static async unpublish(id: number): Promise<DrizzleForm | null> {
    await db.update(forms).set({ status: 'draft', updatedAt: new Date() }).where(eq(forms.id, id));
    return this.findById(id);
  }

  static async archive(id: number): Promise<DrizzleForm | null> {
    await db
      .update(forms)
      .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(forms.id, id));
    return this.findById(id);
  }

  static async hasAnyQuestion(formId: number): Promise<boolean> {
    const rows = await db.select({ id: formQuestions.id }).from(formQuestions).where(eq(formQuestions.formId, formId)).limit(1);
    return rows.length > 0;
  }

  static async recordResponse(formId: number): Promise<void> {
    await db
      .update(forms)
      .set({ responseCount: sql`${forms.responseCount} + 1`, lastResponseAt: new Date() })
      .where(eq(forms.id, formId));
  }

  // Deep-copies form + sections + questions + options + logicRules (fresh ids
  // throughout, remapped via id tables) + settings/theme (closeAt/responseLimit
  // cleared - a duplicated form should start with no distribution deadline).
  // Distributions/responses are intentionally not copied.
  static async duplicate(id: number, createdBy: number): Promise<DrizzleForm> {
    return db.transaction(async (tx) => {
      const original = await tx.query.forms.findFirst({ where: eq(forms.id, id) });
      if (!original) throw new Error('Form not found');

      const [copy] = await tx
        .insert(forms)
        .values({ title: `${original.title} (Copy)`, description: original.description, createdBy })
        .returning();
      if (!copy) throw new Error('Failed to duplicate form');

      const sections = await tx.query.formSections.findMany({
        where: eq(formSections.formId, id),
        orderBy: (t, { asc }) => [asc(t.orderIndex)],
      });
      const sectionIdMap = new Map<number, number>();
      for (const s of sections) {
        const [newSection] = await tx
          .insert(formSections)
          .values({ formId: copy.id, title: s.title, description: s.description, orderIndex: s.orderIndex })
          .returning();
        if (newSection) sectionIdMap.set(s.id, newSection.id);
      }

      const questions = await tx.query.formQuestions.findMany({
        where: eq(formQuestions.formId, id),
        orderBy: (t, { asc }) => [asc(t.orderIndex)],
      });
      const questionIdMap = new Map<number, number>();
      for (const q of questions) {
        const [newQuestion] = await tx
          .insert(formQuestions)
          .values({
            formId: copy.id,
            sectionId: q.sectionId ? (sectionIdMap.get(q.sectionId) ?? null) : null,
            type: q.type,
            title: q.title,
            description: q.description,
            helpText: q.helpText,
            placeholder: q.placeholder,
            required: q.required,
            orderIndex: q.orderIndex,
            config: q.config,
            defaultValue: q.defaultValue,
          })
          .returning();
        if (!newQuestion) continue;
        questionIdMap.set(q.id, newQuestion.id);

        const options = await tx.query.formQuestionOptions.findMany({
          where: eq(formQuestionOptions.questionId, q.id),
          orderBy: (t, { asc }) => [asc(t.orderIndex)],
        });
        if (options.length) {
          await tx.insert(formQuestionOptions).values(
            options.map((o) => ({
              questionId: newQuestion.id,
              label: o.label,
              value: o.value,
              orderIndex: o.orderIndex,
              isOther: o.isOther,
            })),
          );
        }
      }

      const rules = await tx.query.formLogicRules.findMany({ where: eq(formLogicRules.formId, id) });
      const copiedRules = rules
        .map((r) => {
          const targetQuestionId = questionIdMap.get(r.targetQuestionId);
          const sourceQuestionId = questionIdMap.get(r.sourceQuestionId);
          if (!targetQuestionId || !sourceQuestionId) return null;
          return {
            formId: copy.id,
            targetQuestionId,
            sourceQuestionId,
            comparator: r.comparator,
            comparisonValue: r.comparisonValue,
            action: r.action,
            combinator: r.combinator,
            orderIndex: r.orderIndex,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (copiedRules.length) {
        await tx.insert(formLogicRules).values(copiedRules);
      }

      const settings = await tx.query.formSettings.findFirst({ where: eq(formSettings.formId, id) });
      await tx.insert(formSettings).values({
        formId: copy.id,
        thankYouMessage: settings?.thankYouMessage ?? null,
        acceptResponses: true,
        closeAt: null,
        responseLimit: null,
        allowEditAfterSubmit: settings?.allowEditAfterSubmit ?? false,
        notifyOwnerOnResponse: settings?.notifyOwnerOnResponse ?? true,
        notifyRespondent: settings?.notifyRespondent ?? false,
      });

      const theme = await tx.query.formTheme.findFirst({ where: eq(formTheme.formId, id) });
      await tx.insert(formTheme).values({
        formId: copy.id,
        primaryColor: theme?.primaryColor ?? null,
        headerImageUrl: theme?.headerImageUrl ?? null,
      });

      return copy;
    });
  }

  // Recipients cascade at the DB level; attachments (polymorphic, no FK) are
  // deleted by the caller (form.service.ts#delete) before this.
  static async deleteById(id: number): Promise<void> {
    await db.delete(forms).where(eq(forms.id, id));
  }
}
