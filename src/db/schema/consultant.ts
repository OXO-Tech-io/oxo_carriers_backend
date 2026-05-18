import {
    pgTable,
    serial,
    integer,
    varchar,
    text,
    decimal,
    timestamp,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Enums
export const submissionStatusEnum = pgEnum('submission_status', ['pending', 'approved', 'rejected']);

// Consultant Work Submissions Table
export const consultantWorkSubmissions = pgTable('consultant_work_submissions', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    project: varchar('project', { length: 255 }).notNull(),
    tech: varchar('tech', { length: 255 }).notNull(),
    totalHours: decimal('total_hours', { precision: 10, scale: 2 }).notNull(),
    comment: text('comment'),
    logSheetUrl: varchar('log_sheet_url', { length: 500 }).notNull(),
    status: submissionStatusEnum('status').default('pending'),
    adminComment: text('admin_comment'),
    reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    resubmissionOf: integer('resubmission_of'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const consultantWorkSubmissionsRelations = relations(consultantWorkSubmissions, ({ one }) => ({
    user: one(users, {
        fields: [consultantWorkSubmissions.userId],
        references: [users.id],
    }),
    reviewer: one(users, {
        fields: [consultantWorkSubmissions.reviewedBy],
        references: [users.id],
    }),
}));

// Types
export type ConsultantWorkSubmission = typeof consultantWorkSubmissions.$inferSelect;
export type NewConsultantWorkSubmission = typeof consultantWorkSubmissions.$inferInsert;
