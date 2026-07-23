import { db } from '../db';
import { formTheme, type FormTheme as DrizzleFormTheme } from '../db/schema';
import { eq } from 'drizzle-orm';

export type FormThemeUpdateInput = Partial<{
  primaryColor: string;
  headerImageUrl: string | null;
}>;

export class FormThemeModel {
  static async createDefault(formId: number): Promise<DrizzleFormTheme> {
    const [inserted] = await db.insert(formTheme).values({ formId }).returning();
    if (!inserted) throw new Error('Failed to create form theme');
    return inserted;
  }

  static async findByFormId(formId: number): Promise<DrizzleFormTheme | null> {
    const record = await db.query.formTheme.findFirst({ where: eq(formTheme.formId, formId) });
    return record ?? null;
  }

  static async update(formId: number, patch: FormThemeUpdateInput): Promise<DrizzleFormTheme | null> {
    await db
      .update(formTheme)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(formTheme.formId, formId));
    return this.findByFormId(formId);
  }
}
