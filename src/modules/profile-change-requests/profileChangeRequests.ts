import { pgTable, serial, integer, varchar, text, json, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// Enums
export const profileChangeStatusEnum = pgEnum('profile_change_status', [
    'pending_approval',
    'approved',
    'rejected',
    'returned_for_modification',
    'cancelled',
]);

// Profile Change Requests Table
//
// One row = one submission event = a bundle of 1..N diff items stored in `changes`.
// A single Approve/Reject/Return decision applies atomically to the whole bundle.
// See src/validators/profileChangeRequest.validator.ts for the exact shape of each
// item in the `changes` array (discriminated by `entityType`).
export const profileChangeRequests = pgTable('tbl_profile_change_requests', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }), // employee affected
    submittedBy: integer('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    status: profileChangeStatusEnum('status').default('pending_approval'),
    changes: json('changes').notNull(),
    comments: text('comments'),
    reviewerId: integer('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    reviewerComments: text('reviewer_comments'),
    decidedAt: timestamp('decided_at'),
    // Plain column, no .references() - mirrors the users.managerId self-referencing
    // convention (relation only enforced at the Drizzle ORM level, not in Postgres).
    // Links a resubmission back to the request it was returned-for-modification from.
    previousRequestId: integer('previous_request_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const profileChangeRequestsRelations = relations(profileChangeRequests, ({ one }) => ({
    employee: one(users, {
        fields: [profileChangeRequests.employeeId],
        references: [users.employeeId],
        relationName: 'profileChangeEmployee',
    }),
    submitter: one(users, {
        fields: [profileChangeRequests.submittedBy],
        references: [users.id],
        relationName: 'profileChangeSubmitter',
    }),
    reviewer: one(users, {
        fields: [profileChangeRequests.reviewerId],
        references: [users.id],
        relationName: 'profileChangeReviewer',
    }),
    previousRequest: one(profileChangeRequests, {
        fields: [profileChangeRequests.previousRequestId],
        references: [profileChangeRequests.id],
        relationName: 'profileChangeResubmission',
    }),
}));

// Types
export type ProfileChangeRequest = typeof profileChangeRequests.$inferSelect;
export type NewProfileChangeRequest = typeof profileChangeRequests.$inferInsert;
