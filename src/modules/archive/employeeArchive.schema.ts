import { pgTable, serial, varchar, integer, json, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// OCD-453: Archive table for deleted employee profiles.
//
// `employeeId` intentionally has no FK reference (same convention as
// tbl_attachments.entity_id / tbl_audit_logs.record_id) - UsersService.delete
// currently keeps the tbl_employee row around (soft delete via deletedAt),
// but this table must keep working even if a future change makes that a real
// hard delete, so the archive row can't depend on the source row surviving.
//
// `snapshot` captures everything UsersService.delete() actually destroys or
// hides at deletion time (the tbl_employee_pii row is hard-deleted; nominees/
// dependents/emergency contacts/welfare/education/work history rows survive
// but become unreachable once the employee is excluded from listings) so an
// administrator can see the complete profile as it existed at the moment of
// deletion, not just whatever is still queryable afterwards.
export const employeeArchive = pgTable('tbl_employee_archive', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 }).notNull(),
    employeeNumericId: integer('employee_numeric_id'),
    snapshot: json('snapshot').notNull(),
    deletedAt: timestamp('deleted_at').defaultNow().notNull(),
    // Who performed the deletion. No onDelete cascade to a hard row-removal -
    // set null if that admin/HR account is later itself removed, same
    // convention as tbl_attachments.uploaded_by.
    deletedByEmployeeId: integer('deleted_by_employee_id').references(() => users.id, { onDelete: 'set null' }),
    // Denormalized alongside deletedByEmployeeId so "who performed the
    // deletion" keeps displaying correctly even after that FK is nulled out.
    deletedByName: varchar('deleted_by_name', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const employeeArchiveRelations = relations(employeeArchive, ({ one }) => ({
    deletedBy: one(users, {
        fields: [employeeArchive.deletedByEmployeeId],
        references: [users.id],
    }),
}));

export type EmployeeArchive = typeof employeeArchive.$inferSelect;
export type NewEmployeeArchive = typeof employeeArchive.$inferInsert;
