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
export const claimTypeEnum = pgEnum('claim_type', ['IN', 'OPD']);
export const claimStatusEnum = pgEnum('claim_status', ['pending', 'approved', 'rejected']);

// Medical Insurance Claims Table
export const medicalInsuranceClaims = pgTable('medical_insurance_claims', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: claimTypeEnum('type').notNull(),
    quarter: varchar('quarter', { length: 10 }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: claimStatusEnum('status').default('pending'),
    supportiveDocumentUrl: varchar('supportive_document_url', { length: 500 }).notNull(),
    relevantDocumentUrl: varchar('relevant_document_url', { length: 500 }),
    adminComment: text('admin_comment'),
    reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    resubmissionOf: integer('resubmission_of'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const medicalInsuranceClaimsRelations = relations(medicalInsuranceClaims, ({ one }) => ({
    user: one(users, {
        fields: [medicalInsuranceClaims.userId],
        references: [users.id],
    }),
    reviewer: one(users, {
        fields: [medicalInsuranceClaims.reviewedBy],
        references: [users.id],
    }),
}));

// Types
export type MedicalInsuranceClaim = typeof medicalInsuranceClaims.$inferSelect;
export type NewMedicalInsuranceClaim = typeof medicalInsuranceClaims.$inferInsert;
