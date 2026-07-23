import { pgTable, serial, integer, varchar, text, boolean, timestamp, pgEnum, json } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from './employee';

export const formStatusEnum = pgEnum('form_status', ['draft', 'published']);
export const formFieldTypeEnum = pgEnum('form_field_type', ['text', 'radio', 'select', 'file']);

export const forms = pgTable('tbl_forms', {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: formStatusEnum('status').notNull().default('draft'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// `options` holds a JSON string[] of choices, only meaningful for radio/select.
export const formFields = pgTable('tbl_form_fields', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 255 }).notNull(),
    fieldType: formFieldTypeEnum('field_type').notNull(),
    options: json('options'),
    required: boolean('required').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
});

export const formDistributions = pgTable('tbl_form_distributions', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    distributedAt: timestamp('distributed_at').defaultNow(),
});

export const formResponses = pgTable('tbl_form_responses', {
    id: serial('id').primaryKey(),
    formId: integer('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    submittedAt: timestamp('submitted_at').defaultNow(),
});

// File-type answers do not use valueText - instead a row is written into the
// shared `attachments` table with entityType='form_response_answer',
// entityId=this row's id, mirroring the polymorphic attachment convention.
export const formResponseAnswers = pgTable('tbl_form_response_answers', {
    id: serial('id').primaryKey(),
    responseId: integer('response_id').notNull().references(() => formResponses.id, { onDelete: 'cascade' }),
    fieldId: integer('field_id').notNull().references(() => formFields.id, { onDelete: 'cascade' }),
    valueText: text('value_text'),
});

export const formsRelations = relations(forms, ({ one, many }) => ({
    creator: one(users, { fields: [forms.createdBy], references: [users.id] }),
    fields: many(formFields),
    distributions: many(formDistributions),
    responses: many(formResponses),
}));

export const formFieldsRelations = relations(formFields, ({ one, many }) => ({
    form: one(forms, { fields: [formFields.formId], references: [forms.id] }),
    answers: many(formResponseAnswers),
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
    field: one(formFields, { fields: [formResponseAnswers.fieldId], references: [formFields.id] }),
}));

export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type FormField = typeof formFields.$inferSelect;
export type NewFormField = typeof formFields.$inferInsert;
export type FormDistribution = typeof formDistributions.$inferSelect;
export type NewFormDistribution = typeof formDistributions.$inferInsert;
export type FormResponse = typeof formResponses.$inferSelect;
export type NewFormResponse = typeof formResponses.$inferInsert;
export type FormResponseAnswer = typeof formResponseAnswers.$inferSelect;
export type NewFormResponseAnswer = typeof formResponseAnswers.$inferInsert;
