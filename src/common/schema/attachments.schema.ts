import { pgTable, serial, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// Attachments Table
// Generic polymorphic attachment table (entityType + entityId, no FK constraint on entityId
// since it can point at rows in different tables - same pattern as auditLogs.recordId).
// Introduced in Phase 1 for optional supporting documents on profile change requests; reused
// as-is by later phases (HR Notes, Communications, Form Responses, Work Logs).
export const attachments = pgTable('tbl_attachments', {
    id: serial('id').primaryKey(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: integer('entity_id').notNull(),
    fileUrl: varchar('file_url', { length: 500 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 150 }),
    fileSize: integer('file_size'),
    uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const attachmentsRelations = relations(attachments, ({ one }) => ({
    uploader: one(users, {
        fields: [attachments.uploadedBy],
        references: [users.id],
    }),
}));

// Types
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
