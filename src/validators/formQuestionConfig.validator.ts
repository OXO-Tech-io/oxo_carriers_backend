import { z } from 'zod';

/**
 * The 19 Google-Forms-style question types (form_question_type Postgres enum in
 * src/db/schema/forms.ts). Every type's `config` jsonb column follows one of a handful of
 * repeated shapes ("configKind" below) - this is the piece Marketrix's own code describes in a
 * comment (`FormQuestionConfigSchema = z.record(...)`) but never actually built: a real per-type
 * schema, used both to validate question config on create/update and to validate answers against
 * it on submit (see formService.submitResponse).
 */
export const FORM_QUESTION_TYPES = [
  'short_answer',
  'paragraph',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'file_upload',
  'linear_scale',
  'multiple_choice_grid',
  'checkbox_grid',
  'rating',
  'date',
  'time',
  'datetime',
  'yes_no',
  'email',
  'number',
  'url',
  'section_header',
  'rich_text',
] as const;
export const formQuestionTypeSchema = z.enum(FORM_QUESTION_TYPES);
export type FormQuestionType = z.infer<typeof formQuestionTypeSchema>;

type ConfigKind = 'none' | 'text' | 'choice' | 'file' | 'scale' | 'rating' | 'number' | 'grid' | 'richtext';

const CONFIG_KIND_BY_TYPE: Record<FormQuestionType, ConfigKind> = {
  short_answer: 'text',
  paragraph: 'text',
  multiple_choice: 'choice',
  checkboxes: 'choice',
  dropdown: 'choice',
  file_upload: 'file',
  linear_scale: 'scale',
  multiple_choice_grid: 'grid',
  checkbox_grid: 'grid',
  rating: 'rating',
  date: 'none',
  time: 'none',
  datetime: 'none',
  yes_no: 'none',
  email: 'none',
  number: 'number',
  url: 'none',
  section_header: 'none',
  rich_text: 'richtext',
};

/** Choice/selection question types - `options` (form_question_options) required, min 1. */
export const CHOICE_QUESTION_TYPES: FormQuestionType[] = ['multiple_choice', 'checkboxes', 'dropdown'];
/** Grid question types - rows come from `options`, columns from `config.columns`. */
export const GRID_QUESTION_TYPES: FormQuestionType[] = ['multiple_choice_grid', 'checkbox_grid'];
/** Layout-only types: no answer, no required toggle, excluded from analytics/validation. */
export const LAYOUT_QUESTION_TYPES: FormQuestionType[] = ['section_header', 'rich_text'];
/** Used by analytics to build a per-option distribution. */
export const ANALYTICS_CHOICE_TYPES: FormQuestionType[] = ['multiple_choice', 'checkboxes', 'dropdown', 'yes_no'];
/** Used by analytics to bucket numeric answers. */
export const ANALYTICS_NUMERIC_TYPES: FormQuestionType[] = ['linear_scale', 'rating', 'number'];

export const configKindOf = (type: FormQuestionType): ConfigKind => CONFIG_KIND_BY_TYPE[type];

const textConfigSchema = z.object({
  maxLength: z.number().int().positive().optional(),
});

const choiceConfigSchema = z.object({
  allowOther: z.boolean().default(false).optional(),
  minSelections: z.number().int().nonnegative().optional(),
  maxSelections: z.number().int().positive().optional(),
});

const fileConfigSchema = z.object({
  allowedMimeTypes: z.array(z.string().min(1)).optional(),
  maxSizeMb: z.number().positive().default(10).optional(),
  maxFiles: z.number().int().positive().default(1).optional(),
});

const scaleConfigSchema = z
  .object({
    min: z.number().int().default(1),
    max: z.number().int().default(5),
    minLabel: z.string().max(100).optional(),
    maxLabel: z.string().max(100).optional(),
  })
  .refine((c) => c.max > c.min, { message: 'Scale max must be greater than min', path: ['max'] });

const ratingConfigSchema = z.object({
  max: z.union([z.literal(5), z.literal(10)]).default(5),
  icon: z.enum(['star', 'heart', 'emoji']).default('star'),
});

const numberConfigSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .refine((c) => c.min === undefined || c.max === undefined || c.max >= c.min, {
    message: 'Number max must be greater than or equal to min',
    path: ['max'],
  });

const gridConfigSchema = z.object({
  columns: z.array(z.string().min(1)).min(1, 'Grid questions require at least one column'),
});

const richTextConfigSchema = z.object({
  body: z.string().optional(),
});

const noneConfigSchema = z.object({});

const CONFIG_SCHEMA_BY_KIND: Record<ConfigKind, z.ZodTypeAny> = {
  none: noneConfigSchema,
  text: textConfigSchema,
  choice: choiceConfigSchema,
  file: fileConfigSchema,
  scale: scaleConfigSchema,
  rating: ratingConfigSchema,
  number: numberConfigSchema,
  grid: gridConfigSchema,
  richtext: richTextConfigSchema,
};

/** Validates (and coerces defaults into) a question's `config` for its `type`. Unknown/extra keys are stripped. */
export function parseQuestionConfig(type: FormQuestionType, config: unknown): Record<string, unknown> {
  const schema = CONFIG_SCHEMA_BY_KIND[configKindOf(type)];
  return schema.parse(config ?? {}) as Record<string, unknown>;
}
