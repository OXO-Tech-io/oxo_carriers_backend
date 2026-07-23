import { pgTable, serial, integer, varchar, text, boolean, timestamp, pgEnum, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const formStatusEnum = pgEnum('form_status', ['draft', 'published', 'closed', 'archived']);

// 19 Google-Forms-style question types. `form_fields`/`form_field_type` (4 types, no sections/logic)
// is replaced in place by `form_questions` below - see the data-migration script
// (src/scripts/migrateFormFieldsToQuestions.ts) for the old->new mapping applied to existing rows.
export const formQuestionTypeEnum = pgEnum('form_question_type', [
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
]);

export const formLogicComparatorEnum = pgEnum('form_logic_comparator', [
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
]);
export const formLogicActionEnum = pgEnum('form_logic_action', ['show', 'hide']);
export const formLogicCombinatorEnum = pgEnum('form_logic_combinator', ['all', 'any']);
export const formResponseStatusEnum = pgEnum('form_response_status', ['in_progress', 'submitted']);

export const forms = pgTable('forms', {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: formStatusEnum('status').notNull().default('draft'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    publishedAt: timestamp('published_at'),
    archivedAt: timestamp('archived_at'),
    // Denormalized (mirrors Marketrix) - avoids a COUNT query on every list-page render. Kept in
    // sync by the service layer on submit/delete, not by a DB trigger.
    responseCount: integer('response_count').notNull().default(0),
    lastResponseAt: timestamp('last_response_at'),
});

export const formSections = pgTable('form_sections', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull().default(''),
    description: text('description'),
    orderIndex: integer('order_index').notNull().default(0),
});

// Replaces `form_fields`. `config` holds per-type validation/options (max_length, allow_other,
// min/max, columns, allowed_mime_types, etc - see src/validators/formQuestionConfig.validator.ts
// for the exact shape per type). Choice-type options (and grid rows) live in `form_question_options`
// below rather than a `json` column, so they can be individually reordered/edited.
export const formQuestions = pgTable('form_questions', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    sectionId: integer('section_id').references(() => formSections.id, { onDelete: 'set null' }),
    type: formQuestionTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull().default(''),
    description: text('description'),
    helpText: text('help_text'),
    placeholder: varchar('placeholder', { length: 255 }),
    required: boolean('required').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    config: jsonb('config').notNull().default({}),
    defaultValue: jsonb('default_value'),
});

// Doubles as grid rows for multiple_choice_grid/checkbox_grid (columns live in the question's
// `config.columns: string[]`), matching Marketrix's convention.
export const formQuestionOptions = pgTable('form_question_options', {
    id: serial('id').primaryKey(),
    questionId: integer('question_id').notNull().references(() => formQuestions.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 255 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    isOther: boolean('is_other').notNull().default(false),
});

export const formLogicRules = pgTable('form_logic_rules', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    targetQuestionId: integer('target_question_id').notNull().references(() => formQuestions.id, { onDelete: 'cascade' }),
    sourceQuestionId: integer('source_question_id').notNull().references(() => formQuestions.id, { onDelete: 'cascade' }),
    comparator: formLogicComparatorEnum('comparator').notNull(),
    comparisonValue: jsonb('comparison_value'),
    action: formLogicActionEnum('action').notNull().default('show'),
    combinator: formLogicCombinatorEnum('combinator').notNull().default('all'),
    orderIndex: integer('order_index').notNull().default(0),
});

// One row per form. Trimmed to what applies to an internal, always-authenticated HR tool - no
// public-link/password/captcha/webhook/anonymous fields (see plan's "What changes vs. Marketrix").
export const formSettings = pgTable('form_settings', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().unique().references(() => forms.id, { onDelete: 'cascade' }),
    thankYouMessage: text('thank_you_message'),
    acceptResponses: boolean('accept_responses').notNull().default(true),
    closeAt: timestamp('close_at'),
    responseLimit: integer('response_limit'),
    allowEditAfterSubmit: boolean('allow_edit_after_submit').notNull().default(false),
    notifyOwnerOnResponse: boolean('notify_owner_on_response').notNull().default(false),
    notifyRespondent: boolean('notify_respondent').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// One row per form. Minimal theme (primary color + header banner image only) - not the full
// Marketrix theme editor (font/background/button-style/border-radius), see plan for rationale.
export const formTheme = pgTable('form_theme', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().unique().references(() => forms.id, { onDelete: 'cascade' }),
    primaryColor: varchar('primary_color', { length: 32 }).notNull().default('#4f46e5'),
    headerImageUrl: varchar('header_image_url', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const formDistributions = pgTable('form_distributions', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    distributedAt: timestamp('distributed_at').defaultNow(),
});

// One response per employee per form, always (matches current behavior - Marketrix's
// `one_response_per_user` toggle/anonymous `respondent_key` plumbing is dropped, see plan). The
// unique index below enforces this at the DB layer; the service looks up the existing
// (form_id, user_id) row and updates it in place across draft autosaves and (if
// form_settings.allow_edit_after_submit) re-submits.
export const formResponses = pgTable('form_responses', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: formResponseStatusEnum('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at').defaultNow(),
    submittedAt: timestamp('submitted_at'),
    completionMs: integer('completion_ms'),
}, (table) => ({
    formUserUnique: uniqueIndex('form_responses_form_id_user_id_idx').on(table.formId, table.userId),
}));

// File-type answers do not use valueText/value - instead a row is written into the shared
// `attachments` table with entityType='form_response_answer', entityId=this row's id, mirroring
// the polymorphic attachment convention (see src/models/Attachment.ts).
export const formResponseAnswers = pgTable('form_response_answers', {
    id: serial('id').primaryKey(),
    responseId: integer('response_id').notNull().references(() => formResponses.id, { onDelete: 'cascade' }),
    questionId: integer('question_id').notNull().references(() => formQuestions.id, { onDelete: 'cascade' }),
    valueText: text('value_text'),
    // Structured answer (string/string[]/number/{row:col}) - value_text stays as a flattened
    // mirror used for CSV/analytics/search. See plan: the old schema only had value_text, which
    // can't represent grid/multi-select answers cleanly.
    value: jsonb('value').default({}),
}, (table) => ({
    // One answer row per question per response - autosave/resubmit upserts in place instead of
    // accumulating duplicate rows.
    responseQuestionUnique: uniqueIndex('form_response_answers_response_id_question_id_idx').on(table.responseId, table.questionId),
}));

export const formsRelations = relations(forms, ({ one, many }) => ({
    creator: one(users, { fields: [forms.createdBy], references: [users.id] }),
    sections: many(formSections),
    questions: many(formQuestions),
    logicRules: many(formLogicRules),
    settings: one(formSettings, { fields: [forms.id], references: [formSettings.formId] }),
    theme: one(formTheme, { fields: [forms.id], references: [formTheme.formId] }),
    distributions: many(formDistributions),
    responses: many(formResponses),
}));

export const formSectionsRelations = relations(formSections, ({ one, many }) => ({
    form: one(forms, { fields: [formSections.formId], references: [forms.id] }),
    questions: many(formQuestions),
}));

export const formQuestionsRelations = relations(formQuestions, ({ one, many }) => ({
    form: one(forms, { fields: [formQuestions.formId], references: [forms.id] }),
    section: one(formSections, { fields: [formQuestions.sectionId], references: [formSections.id] }),
    options: many(formQuestionOptions),
    answers: many(formResponseAnswers),
    logicRulesAsTarget: many(formLogicRules, { relationName: 'logicRuleTarget' }),
    logicRulesAsSource: many(formLogicRules, { relationName: 'logicRuleSource' }),
}));

export const formQuestionOptionsRelations = relations(formQuestionOptions, ({ one }) => ({
    question: one(formQuestions, { fields: [formQuestionOptions.questionId], references: [formQuestions.id] }),
}));

export const formLogicRulesRelations = relations(formLogicRules, ({ one }) => ({
    form: one(forms, { fields: [formLogicRules.formId], references: [forms.id] }),
    targetQuestion: one(formQuestions, {
        fields: [formLogicRules.targetQuestionId],
        references: [formQuestions.id],
        relationName: 'logicRuleTarget',
    }),
    sourceQuestion: one(formQuestions, {
        fields: [formLogicRules.sourceQuestionId],
        references: [formQuestions.id],
        relationName: 'logicRuleSource',
    }),
}));

export const formSettingsRelations = relations(formSettings, ({ one }) => ({
    form: one(forms, { fields: [formSettings.formId], references: [forms.id] }),
}));

export const formThemeRelations = relations(formTheme, ({ one }) => ({
    form: one(forms, { fields: [formTheme.formId], references: [forms.id] }),
}));

export const formDistributionsRelations = relations(formDistributions, ({ one }) => ({
    form: one(forms, { fields: [formDistributions.formId], references: [forms.id] }),
    user: one(users, { fields: [formDistributions.userId], references: [users.id] }),
}));

export const formResponsesRelations = relations(formResponses, ({ one, many }) => ({
    form: one(forms, { fields: [formResponses.formId], references: [forms.id] }),
    user: one(users, { fields: [formResponses.userId], references: [users.id] }),
    answers: many(formResponseAnswers),
}));

export const formResponseAnswersRelations = relations(formResponseAnswers, ({ one }) => ({
    response: one(formResponses, { fields: [formResponseAnswers.responseId], references: [formResponses.id] }),
    question: one(formQuestions, { fields: [formResponseAnswers.questionId], references: [formQuestions.id] }),
}));

export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type FormSection = typeof formSections.$inferSelect;
export type NewFormSection = typeof formSections.$inferInsert;
export type FormQuestion = typeof formQuestions.$inferSelect;
export type NewFormQuestion = typeof formQuestions.$inferInsert;
export type FormQuestionOption = typeof formQuestionOptions.$inferSelect;
export type NewFormQuestionOption = typeof formQuestionOptions.$inferInsert;
export type FormLogicRule = typeof formLogicRules.$inferSelect;
export type NewFormLogicRule = typeof formLogicRules.$inferInsert;
export type FormSettings = typeof formSettings.$inferSelect;
export type NewFormSettings = typeof formSettings.$inferInsert;
export type FormTheme = typeof formTheme.$inferSelect;
export type NewFormTheme = typeof formTheme.$inferInsert;
export type FormDistribution = typeof formDistributions.$inferSelect;
export type NewFormDistribution = typeof formDistributions.$inferInsert;
export type FormResponse = typeof formResponses.$inferSelect;
export type NewFormResponse = typeof formResponses.$inferInsert;
export type FormResponseAnswer = typeof formResponseAnswers.$inferSelect;
export type NewFormResponseAnswer = typeof formResponseAnswers.$inferInsert;
