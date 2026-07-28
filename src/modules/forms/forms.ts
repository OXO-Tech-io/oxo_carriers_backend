import { pgTable, serial, integer, varchar, text, boolean, timestamp, pgEnum, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// 'closed' is intentionally not a stored value here - it's derived at read
// time from status==='published' + settings.acceptResponses/closeAt (see
// form.service.ts#deriveStatus). Only draft/published/archived are ever
// written to the DB.
export const formStatusEnum = pgEnum('form_status', ['draft', 'published', 'archived']);

export const formQuestionTypeEnum = pgEnum('form_question_type', [
    'short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown',
    'file_upload', 'linear_scale', 'multiple_choice_grid', 'checkbox_grid', 'rating',
    'date', 'time', 'datetime', 'yes_no', 'email', 'number', 'url',
    'section_header', 'rich_text',
]);

export const formLogicComparatorEnum = pgEnum('form_logic_comparator', [
    'equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty',
]);
export const formLogicActionEnum = pgEnum('form_logic_action', ['show', 'hide']);
export const formLogicCombinatorEnum = pgEnum('form_logic_combinator', ['all', 'any']);
export const formResponseStatusEnum = pgEnum('form_response_status', ['in_progress', 'submitted']);

export const forms = pgTable('tbl_forms', {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: formStatusEnum('status').notNull().default('draft'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    publishedAt: timestamp('published_at'),
    archivedAt: timestamp('archived_at'),
    responseCount: integer('response_count').notNull().default(0),
    lastResponseAt: timestamp('last_response_at'),
});

export const formSections = pgTable('tbl_form_sections', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    orderIndex: integer('order_index').notNull().default(0),
});

// Replaces the old flat tbl_form_fields. `options` (in a separate table, see
// formQuestionOptions) doubles as real answer choices for choice-type
// questions AND as row labels for grid-type questions - grid column labels
// live in `config.columns` instead. `config`/`defaultValue` are loose jsonb
// since their shape is genuinely per-type (see form.validator.ts) and the
// authoritative validation of that shape lives at the editor UI layer today.
export const formQuestions = pgTable('tbl_form_questions', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    // A deleted section un-sections its questions rather than deleting them
    // (see form.service.ts#deleteSection) - set null, not cascade.
    sectionId: integer('section_id').references(() => formSections.id, { onDelete: 'set null' }),
    type: formQuestionTypeEnum('type').notNull(),
    title: varchar('title', { length: 500 }).notNull().default(''),
    description: text('description'),
    helpText: text('help_text'),
    placeholder: varchar('placeholder', { length: 500 }),
    required: boolean('required').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    config: jsonb('config').notNull().default({}),
    defaultValue: jsonb('default_value'),
});

export const formQuestionOptions = pgTable('tbl_form_question_options', {
    id: serial('id').primaryKey(),
    questionId: integer('question_id').notNull().references(() => formQuestions.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 255 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    isOther: boolean('is_other').notNull().default(false),
});

export const formLogicRules = pgTable('tbl_form_logic_rules', {
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

// 1:1 with forms - created alongside the form (see FormModel.create).
export const formSettings = pgTable('tbl_form_settings', {
    formId: integer('form_id').primaryKey().references(() => forms.id, { onDelete: 'cascade' }),
    thankYouMessage: text('thank_you_message'),
    acceptResponses: boolean('accept_responses').notNull().default(true),
    closeAt: timestamp('close_at'),
    responseLimit: integer('response_limit'),
    allowEditAfterSubmit: boolean('allow_edit_after_submit').notNull().default(false),
    notifyOwnerOnResponse: boolean('notify_owner_on_response').notNull().default(true),
    notifyRespondent: boolean('notify_respondent').notNull().default(false),
});

// 1:1 with forms - created alongside the form (see FormModel.create). Header
// image is a single 1:1 file, stored as a plain URL column rather than
// through the polymorphic tbl_attachments table.
export const formTheme = pgTable('tbl_form_theme', {
    formId: integer('form_id').primaryKey().references(() => forms.id, { onDelete: 'cascade' }),
    primaryColor: varchar('primary_color', { length: 20 }),
    headerImageUrl: varchar('header_image_url', { length: 500 }),
});

export const formDistributions = pgTable('tbl_form_distributions', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    distributedAt: timestamp('distributed_at').defaultNow(),
}, (table) => ({
    formEmployeeUnique: uniqueIndex('tbl_form_distributions_form_id_employee_id_idx').on(table.formId, table.employeeId),
}));

export const formResponses = pgTable('tbl_form_responses', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    status: formResponseStatusEnum('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at').defaultNow(),
    submittedAt: timestamp('submitted_at'),
    completionMs: integer('completion_ms'),
}, (table) => ({
    formEmployeeUnique: uniqueIndex('tbl_form_responses_form_id_employee_id_idx').on(table.formId, table.employeeId),
}));

// File-type answers do not use value/valueText - instead a row is written
// into the shared `attachments` table with entityType='form_response_answer',
// entityId=this row's id, mirroring the polymorphic attachment convention.
// `value` is the structured answer (string/number/string[]/object depending
// on question type); `valueText` is a flattened string derived from it for
// CSV export/search.
export const formResponseAnswers = pgTable('tbl_form_response_answers', {
    id: serial('id').primaryKey(),
    responseId: integer('response_id').notNull().references(() => formResponses.id, { onDelete: 'cascade' }),
    questionId: integer('question_id').notNull().references(() => formQuestions.id, { onDelete: 'cascade' }),
    value: jsonb('value'),
    valueText: text('value_text'),
});

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
}));

export const formQuestionOptionsRelations = relations(formQuestionOptions, ({ one }) => ({
    question: one(formQuestions, { fields: [formQuestionOptions.questionId], references: [formQuestions.id] }),
}));

export const formLogicRulesRelations = relations(formLogicRules, ({ one }) => ({
    form: one(forms, { fields: [formLogicRules.formId], references: [forms.id] }),
    targetQuestion: one(formQuestions, { fields: [formLogicRules.targetQuestionId], references: [formQuestions.id] }),
    sourceQuestion: one(formQuestions, { fields: [formLogicRules.sourceQuestionId], references: [formQuestions.id] }),
}));

export const formSettingsRelations = relations(formSettings, ({ one }) => ({
    form: one(forms, { fields: [formSettings.formId], references: [forms.id] }),
}));

export const formThemeRelations = relations(formTheme, ({ one }) => ({
    form: one(forms, { fields: [formTheme.formId], references: [forms.id] }),
}));

export const formDistributionsRelations = relations(formDistributions, ({ one }) => ({
    form: one(forms, { fields: [formDistributions.formId], references: [forms.id] }),
    user: one(users, { fields: [formDistributions.employeeId], references: [users.employeeId] }),
}));

export const formResponsesRelations = relations(formResponses, ({ one, many }) => ({
    form: one(forms, { fields: [formResponses.formId], references: [forms.id] }),
    user: one(users, { fields: [formResponses.employeeId], references: [users.employeeId] }),
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
export type FormSettingsRow = typeof formSettings.$inferSelect;
export type NewFormSettingsRow = typeof formSettings.$inferInsert;
export type FormThemeRow = typeof formTheme.$inferSelect;
export type NewFormThemeRow = typeof formTheme.$inferInsert;
export type FormDistribution = typeof formDistributions.$inferSelect;
export type NewFormDistribution = typeof formDistributions.$inferInsert;
export type FormResponse = typeof formResponses.$inferSelect;
export type NewFormResponse = typeof formResponses.$inferInsert;
export type FormResponseAnswer = typeof formResponseAnswers.$inferSelect;
export type NewFormResponseAnswer = typeof formResponseAnswers.$inferInsert;
