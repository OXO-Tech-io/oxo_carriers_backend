import { db } from '../../db';
import { forms, formFields, type Form as DrizzleForm, type FormField as DrizzleFormField, type NewFormField } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type FormInput = {
  title: string;
  description?: string | null;
  createdBy: number;
};

export type FormFieldInput = {
  label: string;
  fieldType: 'text' | 'radio' | 'select' | 'file';
  options?: string[] | null;
  required: boolean;
  orderIndex: number;
};

export class FormModel {
  static async createWithFields(form: FormInput, fields: FormFieldInput[]): Promise<{ form: DrizzleForm; fields: DrizzleFormField[] }> {
    return db.transaction(async (tx) => {
      const [insertedForm] = await tx.insert(forms).values(form).returning();
      if (!insertedForm) throw new Error('Failed to create form');

      const fieldRows: NewFormField[] = fields.map((f) => ({
        formId: insertedForm.id,
        label: f.label,
        fieldType: f.fieldType,
        options: f.options ?? null,
        required: f.required,
        orderIndex: f.orderIndex,
      }));
      const insertedFields = fieldRows.length ? await tx.insert(formFields).values(fieldRows).returning() : [];

      return { form: insertedForm, fields: insertedFields };
    });
  }

  static async findById(id: number): Promise<DrizzleForm | null> {
    const record = await db.query.forms.findFirst({ where: eq(forms.id, id) });
    return record ?? null;
  }

  static async listAll(): Promise<DrizzleForm[]> {
    return db.query.forms.findMany({ orderBy: (t, { desc }) => [desc(t.createdAt)] });
  }

  static async publish(id: number): Promise<DrizzleForm | null> {
    await db.update(forms).set({ status: 'published', updatedAt: new Date() }).where(eq(forms.id, id));
    return this.findById(id);
  }

  static async listFieldsByFormId(formId: number): Promise<DrizzleFormField[]> {
    return db.query.formFields.findMany({
      where: eq(formFields.formId, formId),
      orderBy: (t, { asc }) => [asc(t.orderIndex)],
    });
  }
}
