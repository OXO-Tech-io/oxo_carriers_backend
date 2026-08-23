import { pgTable, serial, varchar, date, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';
import { bytea, employeeSexEnum } from '../../employees/employeePii.schema';

// Enums
export const dependentRelationshipEnum = pgEnum('dependent_relationship', ['spouse', 'child']);

// Employee Dependents Table (Tab C - medical insurance/welfare family members).
// Multi-record, only meaningful while the employee's employeePii.maritalStatus
// is 'married' (enforced in profileChangeRequest.service.ts). fullName/nic/
// mobileNumber are encrypted like tbl_employee_pii; writes only ever happen
// via ProfileChangeRequest approval (see profileChangeRequests.ts).
export const employeeDependents = pgTable('tbl_employee_dependents', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    fullName: bytea('full_name'),
    // Not applicable for children under 16 years of age.
    nic: bytea('nic'),
    dateOfBirth: date('date_of_birth').notNull(),
    gender: employeeSexEnum('gender').notNull(),
    relationship: dependentRelationshipEnum('relationship').notNull(),
    mobileNumber: bytea('mobile_number'),
    // Only meaningful for relationship = 'child'.
    school: bytea('school'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeeDependentsRelations = relations(employeeDependents, ({ one }) => ({
    employee: one(users, {
        fields: [employeeDependents.employeeId],
        references: [users.employeeId],
    }),
}));

export type EmployeeDependent = typeof employeeDependents.$inferSelect;
export type NewEmployeeDependent = typeof employeeDependents.$inferInsert;
