import { pgTable, serial, varchar, decimal, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';
import { bytea } from '../employee-pii/employeePii.schema';

// Employee Nominees Table (Tab 1a - EPF/ETF beneficiaries, max 2 per employee,
// enforced in profileChangeRequest.service.ts, not at the DB level).
// name/nic are encrypted like tbl_employee_pii; writes only ever happen via
// ProfileChangeRequest approval (see profileChangeRequests.ts).
export const employeeNominees = pgTable('tbl_employee_nominees', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    nameWithInitials: bytea('name_with_initials'),
    nic: bytea('nic'),
    relationship: varchar('relationship', { length: 100 }).notNull(),
    proportionPercent: decimal('proportion_percent', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeeNomineesRelations = relations(employeeNominees, ({ one }) => ({
    employee: one(users, {
        fields: [employeeNominees.employeeId],
        references: [users.employeeId],
    }),
}));

export type EmployeeNominee = typeof employeeNominees.$inferSelect;
export type NewEmployeeNominee = typeof employeeNominees.$inferInsert;
