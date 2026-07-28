import { z } from 'zod';

export const FORM_QUESTION_TYPES = [
  'short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown',
  'file_upload', 'linear_scale', 'multiple_choice_grid', 'checkbox_grid', 'rating',
  'date', 'time', 'datetime', 'yes_no', 'email', 'number', 'url',
  'section_header', 'rich_text',
] as const;

// Types whose builder UI requires at least one option/row before it's usable.
const OPTION_REQUIRED_TYPES = new Set([
  'multiple_choice', 'checkboxes', 'dropdown', 'multiple_choice_grid', 'checkbox_grid',
]);

const formQuestionTypeSchema = z.enum(FORM_QUESTION_TYPES);

// Multipart form-data (required whenever a file is attached - question
// creation with defaults never needs this, but response submission does)
// encodes booleans as plain strings - same helper as communication.validator.ts.
const booleanField = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined ? defaultValue : v === true || v === 'true'));

const nullableDateField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));

export const createFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional(),
  closeAt: nullableDateField,
});
export type CreateFormInput = z.infer<typeof createFormSchema>;

export const updateFormSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateFormInput = z.infer<typeof updateFormSchema>;

export const createSectionSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

export const reorderSectionsSchema = z.object({
  sectionIds: z.array(z.coerce.number().int().positive()),
});
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;

export const reorderQuestionsSchema = z.object({
  questionIds: z.array(z.coerce.number().int().positive()),
  sectionId: z.coerce.number().int().positive().nullable().optional(),
});
export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsSchema>;

const questionOptionInputSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().min(1),
  value: z.string().min(1),
  isOther: z.boolean().optional(),
});

export const createQuestionSchema = z
  .object({
    sectionId: z.number().int().positive().nullable().optional(),
    type: formQuestionTypeSchema,
    title: z.string().max(500).optional(),
    description: z.string().max(2000).nullable().optional(),
    helpText: z.string().max(2000).nullable().optional(),
    placeholder: z.string().max(500).nullable().optional(),
    required: z.boolean().optional(),
    config: z.unknown().optional(),
    defaultValue: z.unknown().optional(),
    options: z.array(questionOptionInputSchema).optional(),
  })
  .refine((q) => (OPTION_REQUIRED_TYPES.has(q.type) ? !!q.options && q.options.length > 0 : true), {
    message: 'This question type requires at least one option',
    path: ['options'],
  });
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = z.object({
  sectionId: z.number().int().positive().nullable().optional(),
  type: formQuestionTypeSchema.optional(),
  title: z.string().max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  helpText: z.string().max(2000).nullable().optional(),
  placeholder: z.string().max(500).nullable().optional(),
  required: z.boolean().optional(),
  config: z.unknown().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(questionOptionInputSchema).optional(),
});
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

const logicComparatorSchema = z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty']);
const logicActionSchema = z.enum(['show', 'hide']);
const logicCombinatorSchema = z.enum(['all', 'any']);

export const createLogicRuleSchema = z.object({
  targetQuestionId: z.number().int().positive(),
  sourceQuestionId: z.number().int().positive(),
  comparator: logicComparatorSchema,
  comparisonValue: z.unknown().optional(),
  action: logicActionSchema.optional(),
  combinator: logicCombinatorSchema.optional(),
});
export type CreateLogicRuleInput = z.infer<typeof createLogicRuleSchema>;

export const updateLogicRuleSchema = z.object({
  sourceQuestionId: z.number().int().positive().optional(),
  comparator: logicComparatorSchema.optional(),
  comparisonValue: z.unknown().optional(),
  action: logicActionSchema.optional(),
  combinator: logicCombinatorSchema.optional(),
});
export type UpdateLogicRuleInput = z.infer<typeof updateLogicRuleSchema>;

export const updateSettingsSchema = z.object({
  thankYouMessage: z.string().max(2000).nullable().optional(),
  acceptResponses: z.boolean().optional(),
  closeAt: z.union([z.string(), z.null()]).optional().transform((v) => (v === undefined ? undefined : v ? new Date(v) : null)),
  responseLimit: z.number().int().positive().nullable().optional(),
  allowEditAfterSubmit: z.boolean().optional(),
  notifyOwnerOnResponse: z.boolean().optional(),
  notifyRespondent: z.boolean().optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// PUT /forms/:formId/theme is multipart whenever a headerImage file is
// attached, so string values must be tolerated for otherwise-typed fields.
export const updateThemeSchema = z.object({
  primaryColor: z.union([z.string(), z.null()]).optional(),
  headerImageUrl: z.union([z.string(), z.null()]).optional(),
});
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;

export const distributeFormSchema = z
  .object({
    userIds: z.array(z.coerce.number().int().positive()).optional().default([]),
    groupIds: z.array(z.coerce.number().int().positive()).optional().default([]),
    closeAt: nullableDateField,
  })
  .refine((data) => data.userIds.length > 0 || data.groupIds.length > 0, {
    message: 'At least one employee or group is required',
    path: ['userIds'],
  });
export type DistributeFormInput = z.infer<typeof distributeFormSchema>;

const answerSchema = z.object({
  questionId: z.coerce.number().int().positive(),
  value: z.unknown().optional(),
});

export const submitFormResponseSchema = z.object({
  // Sent as a JSON string when the request is multipart/form-data (because
  // file-type fields require multipart), or as a plain array otherwise.
  answers: z
    .union([z.array(answerSchema), z.string()])
    .transform((v) => (typeof v === 'string' ? JSON.parse(v) : v))
    .pipe(z.array(answerSchema)),
  // Draft autosave sends final=false (validation skipped); real submission
  // sends final=true (required-visible-question validation enforced).
  final: booleanField(true),
});
export type SubmitFormResponseInput = z.infer<typeof submitFormResponseSchema>;

export const formIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type FormIdParam = z.infer<typeof formIdParamSchema>;
