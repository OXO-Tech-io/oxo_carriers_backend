import { db } from '../../db';
import { formSettings, type FormSettingsRow } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type FormSettingsPatch = Partial<{
  thankYouMessage: string | null;
  acceptResponses: boolean;
  closeAt: Date | null;
  responseLimit: number | null;
  allowEditAfterSubmit: boolean;
  notifyOwnerOnResponse: boolean;
  notifyRespondent: boolean;
}>;

export class FormSettingsModel {
  static async findByFormId(formId: number): Promise<FormSettingsRow | null> {
    const record = await db.query.formSettings.findFirst({ where: eq(formSettings.formId, formId) });
    return record ?? null;
  }

  static async update(formId: number, patch: FormSettingsPatch): Promise<FormSettingsRow | null> {
    if (Object.keys(patch).length) {
      await db.update(formSettings).set(patch).where(eq(formSettings.formId, formId));
    }
    return this.findByFormId(formId);
  }
}
