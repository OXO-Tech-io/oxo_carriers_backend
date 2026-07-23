import { db } from '../db';
import { formSettings, type FormSettings as DrizzleFormSettings } from '../db/schema';
import { eq } from 'drizzle-orm';

export type FormSettingsUpdateInput = Partial<{
  thankYouMessage: string | null;
  acceptResponses: boolean;
  closeAt: Date | null;
  responseLimit: number | null;
  allowEditAfterSubmit: boolean;
  notifyOwnerOnResponse: boolean;
  notifyRespondent: boolean;
}>;

export class FormSettingsModel {
  static async createDefault(formId: number): Promise<DrizzleFormSettings> {
    const [inserted] = await db.insert(formSettings).values({ formId }).returning();
    if (!inserted) throw new Error('Failed to create form settings');
    return inserted;
  }

  static async findByFormId(formId: number): Promise<DrizzleFormSettings | null> {
    const record = await db.query.formSettings.findFirst({ where: eq(formSettings.formId, formId) });
    return record ?? null;
  }

  static async update(formId: number, patch: FormSettingsUpdateInput): Promise<DrizzleFormSettings | null> {
    await db
      .update(formSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(formSettings.formId, formId));
    return this.findByFormId(formId);
  }
}
