import { db } from '../../db';
import { formTheme, type FormThemeRow } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type FormThemePatch = Partial<{
  primaryColor: string | null;
  headerImageUrl: string | null;
}>;

export class FormThemeModel {
  static async findByFormId(formId: number): Promise<FormThemeRow | null> {
    const record = await db.query.formTheme.findFirst({ where: eq(formTheme.formId, formId) });
    return record ?? null;
  }

  static async update(formId: number, patch: FormThemePatch): Promise<FormThemeRow | null> {
    if (Object.keys(patch).length) {
      await db.update(formTheme).set(patch).where(eq(formTheme.formId, formId));
    }
    return this.findByFormId(formId);
  }
}
