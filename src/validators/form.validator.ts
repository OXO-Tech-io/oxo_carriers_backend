import { z } from 'zod';

export const formFieldInputSchema = z
  .object({
    label: z.string().min(1, 'Field label is required').max(255),
    fieldType: z.enum(['text', 'radio', 'select', 'file']),
    options: z.array(z.string().min(1)).optional(),
    required: z.boolean().default(false),
    orderIndex: z.number().int().nonnegative(),
  })
  .refine((f) => (f.fieldType === 'radio' || f.fieldType === 'select' ? !!f.options && f.options.length > 0 : true), {
    message: 'Radio/select fields require at least one option',
    path: ['options'],
  });

export const createFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional(),
  fields: z.array(formFieldInputSchema).min(1, 'At least one field is required'),
});
export type CreateFormInput = z.infer<typeof createFormSchema>;

export const distributeFormSchema = z.object({
  userIds: z.array(z.coerce.number().int().positive()).min(1, 'At least one employee is required'),
});
export type DistributeFormInput = z.infer<typeof distributeFormSchema>;

const answerSchema = z.object({
  fieldId: z.coerce.number().int().positive(),
  value: z.string().optional(),
});

export const submitFormResponseSchema = z.object({
  // Sent as a JSON string when the request is multipart/form-data (because
  // file-type fields require multipart), or as a plain array otherwise.
  answers: z
    .union([z.array(answerSchema), z.string()])
    .transform((v) => (typeof v === 'string' ? JSON.parse(v) : v))
    .pipe(z.array(answerSchema).min(1, 'At least one answer is required')),
});
export type SubmitFormResponseInput = z.infer<typeof submitFormResponseSchema>;

export const formIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type FormIdParam = z.infer<typeof formIdParamSchema>;
