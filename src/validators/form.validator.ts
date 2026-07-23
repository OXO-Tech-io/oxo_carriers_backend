import { z } from 'zod';
import { formQuestionTypeSchema, CHOICE_QUESTION_TYPES, GRID_QUESTION_TYPES } from './formQuestionConfig.validator';

// ─── Forms ──────────────────────────────────────────────────────────────────
// Forms are now created empty (title + description only) and built up through the
// sections/questions/logic-rule endpoints below, matching the Google-Forms-style
// "create -> builder" flow (frontend routes straight to /admin/forms/:id/edit after create).

export const createFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional(),
});
export type CreateFormInput = z.infer<typeof createFormSchema>;

export const updateFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateFormInput = z.infer<typeof updateFormSchema>;

export const distributeFormSchema = z
  .object({
    userIds: z.array(z.coerce.number().int().positive()).optional().default([]),
    groupIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  })
  .refine((data) => data.userIds.length > 0 || data.groupIds.length > 0, {
    message: 'At least one employee or group is required',
    path: ['userIds'],
  });
export type DistributeFormInput = z.infer<typeof distributeFormSchema>;

// ─── Sections ───────────────────────────────────────────────────────────────

export const createSectionSchema = z.object({
  title: z.string().max(255).optional().default(''),
  description: z.string().max(2000).optional(),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

export const reorderSectionsSchema = z.object({
  sectionIds: z.array(z.coerce.number().int().positive()).min(1),
});
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;

// ─── Questions ──────────────────────────────────────────────────────────────

const questionOptionInputSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().min(1, 'Option label is required').max(255),
  value: z.string().min(1).max(255).optional(),
  isOther: z.boolean().optional().default(false),
});

const requiresOptions = (type: z.infer<typeof formQuestionTypeSchema>) =>
  CHOICE_QUESTION_TYPES.includes(type) || GRID_QUESTION_TYPES.includes(type);

export const createQuestionSchema = z
  .object({
    sectionId: z.number().int().positive().nullable().optional(),
    type: formQuestionTypeSchema,
    title: z.string().max(255).optional().default(''),
    description: z.string().max(2000).nullable().optional(),
    helpText: z.string().max(2000).nullable().optional(),
    placeholder: z.string().max(255).nullable().optional(),
    required: z.boolean().optional().default(false),
    config: z.record(z.string(), z.unknown()).optional().default({}),
    defaultValue: z.unknown().optional(),
    options: z.array(questionOptionInputSchema).optional().default([]),
  })
  .refine((q) => (requiresOptions(q.type) ? q.options.length > 0 : true), {
    message: 'This question type requires at least one option',
    path: ['options'],
  });
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = z.object({
  sectionId: z.number().int().positive().nullable().optional(),
  type: formQuestionTypeSchema.optional(),
  title: z.string().max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  helpText: z.string().max(2000).nullable().optional(),
  placeholder: z.string().max(255).nullable().optional(),
  required: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(questionOptionInputSchema).optional(),
});
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const reorderQuestionsSchema = z.object({
  questionIds: z.array(z.coerce.number().int().positive()).min(1),
  sectionId: z.number().int().positive().nullable().optional(),
});
export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsSchema>;

// ─── Logic rules ────────────────────────────────────────────────────────────

const logicComparatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
]);
const logicActionSchema = z.enum(['show', 'hide']);
const logicCombinatorSchema = z.enum(['all', 'any']);

export const createLogicRuleSchema = z
  .object({
    targetQuestionId: z.coerce.number().int().positive(),
    sourceQuestionId: z.coerce.number().int().positive(),
    comparator: logicComparatorSchema,
    comparisonValue: z.unknown().optional(),
    action: logicActionSchema.optional().default('show'),
    combinator: logicCombinatorSchema.optional().default('all'),
  })
  .refine((r) => r.targetQuestionId !== r.sourceQuestionId, {
    message: 'A question cannot have logic based on itself',
    path: ['sourceQuestionId'],
  });
export type CreateLogicRuleInput = z.infer<typeof createLogicRuleSchema>;

export const updateLogicRuleSchema = z.object({
  comparator: logicComparatorSchema.optional(),
  comparisonValue: z.unknown().optional(),
  action: logicActionSchema.optional(),
  combinator: logicCombinatorSchema.optional(),
});
export type UpdateLogicRuleInput = z.infer<typeof updateLogicRuleSchema>;

// ─── Settings & theme ───────────────────────────────────────────────────────

export const updateFormSettingsSchema = z.object({
  thankYouMessage: z.string().max(2000).nullable().optional(),
  acceptResponses: z.boolean().optional(),
  closeAt: z.coerce.date().nullable().optional(),
  responseLimit: z.number().int().positive().nullable().optional(),
  allowEditAfterSubmit: z.boolean().optional(),
  notifyOwnerOnResponse: z.boolean().optional(),
  notifyRespondent: z.boolean().optional(),
});
export type UpdateFormSettingsInput = z.infer<typeof updateFormSettingsSchema>;

export const updateFormThemeSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'primaryColor must be a hex color like #4f46e5')
    .optional(),
  headerImageUrl: z.string().max(500).nullable().optional(),
});
export type UpdateFormThemeInput = z.infer<typeof updateFormThemeSchema>;

// ─── Responses ──────────────────────────────────────────────────────────────

const answerSchema = z.object({
  questionId: z.coerce.number().int().positive(),
  value: z.unknown().optional(),
});

export const submitFormResponseSchema = z.object({
  // Sent as a JSON string when the request is multipart/form-data (because file-type questions
  // require multipart), or as a plain array otherwise.
  answers: z
    .union([z.array(answerSchema), z.string()])
    .transform((v) => (typeof v === 'string' ? JSON.parse(v) : v))
    .pipe(z.array(answerSchema)),
  // false = autosave draft (no required/logic validation), true = final submit (fully validated).
  final: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional()
    .default(true),
});
export type SubmitFormResponseInput = z.infer<typeof submitFormResponseSchema>;

export const formIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type FormIdParam = z.infer<typeof formIdParamSchema>;

// Same shape as formIdParamSchema, reused for routes whose `:id` refers to a section/question/
// logic-rule row rather than the form itself (e.g. PUT /sections/:id).
export const idParamSchema = formIdParamSchema;
export type IdParam = FormIdParam;

// ─── Export ─────────────────────────────────────────────────────────────────

export const exportResponsesQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).optional().default('xlsx'),
});
export type ExportResponsesQuery = z.infer<typeof exportResponsesQuerySchema>;
