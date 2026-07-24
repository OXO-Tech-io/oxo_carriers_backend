import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';
import { bytea } from '../employee-pii/employeePii.schema';

// Employee Emergency Contacts Table (Tab D - multi-record).
// Supersedes the single-row emergencyContactName/Phone/Relationship columns
// on tbl_employee_pii, which cannot hold more than one contact. Those legacy
// columns are kept (read-only) for backward compatibility; existing data is
// backfilled into this table as each employee's first record (see
// src/scripts/addProfileTabFields.ts). name/contactNumber are encrypted like
// tbl_employee_pii; writes only ever happen via ProfileChangeRequest approval.
export const employeeEmergencyContacts = pgTable('tbl_employee_emergency_contacts', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: bytea('name'),
    relationship: varchar('relationship', { length: 100 }).notNull(),
    contactNumber: bytea('contact_number'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeeEmergencyContactsRelations = relations(employeeEmergencyContacts, ({ one }) => ({
    employee: one(users, {
        fields: [employeeEmergencyContacts.employeeId],
        references: [users.employeeId],
    }),
}));

export type EmployeeEmergencyContact = typeof employeeEmergencyContacts.$inferSelect;
export type NewEmployeeEmergencyContact = typeof employeeEmergencyContacts.$inferInsert;
