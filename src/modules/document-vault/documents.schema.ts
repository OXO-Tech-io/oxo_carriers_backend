import { pgTable, serial, integer, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// Document Vault: an uploaded document targeted either at specific employees
// (targetType='individual', rows exist in tbl_document_recipients) or at
// every employee (targetType='all', no recipient rows - "all" is a flag,
// not a per-row fan-out, mirroring how tbl_notices has no per-recipient row).
export const documents = pgTable('tbl_documents', {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    targetType: varchar('target_type', { length: 20 }).notNull(), // 'individual' | 'all'
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// One row per targeted employee - populated ONLY when targetType='individual'.
export const documentRecipients = pgTable('tbl_document_recipients', {
    id: serial('id').primaryKey(),
    documentId: integer('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
}, (table) => ({
    documentEmployeeIdx: uniqueIndex('tbl_document_recipients_document_id_employee_id_idx').on(table.documentId, table.employeeId),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
    creator: one(users, { fields: [documents.createdBy], references: [users.id] }),
    recipients: many(documentRecipients),
}));

export const documentRecipientsRelations = relations(documentRecipients, ({ one }) => ({
    document: one(documents, { fields: [documentRecipients.documentId], references: [documents.id] }),
    employee: one(users, { fields: [documentRecipients.employeeId], references: [users.employeeId] }),
}));

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentRecipient = typeof documentRecipients.$inferSelect;
export type NewDocumentRecipient = typeof documentRecipients.$inferInsert;
