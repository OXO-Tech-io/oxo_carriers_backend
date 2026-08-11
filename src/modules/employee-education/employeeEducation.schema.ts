import { pgTable, serial, varchar, text, date, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// Enums
export const qualificationLevelEnum = pgEnum('qualification_level', [
    'certificate',
    'advanced_certificate',
    'diploma',
    'advanced_diploma',
    'degree',
    'postgraduate_diploma',
    'masters',
    'mphil',
    'phd',
]);

// Employee Education Table
// Holds only the approved state of an employee's educational background.
// Writes only ever happen via ProfileChangeRequest approval (see profileChangeRequests.ts).
export const employeeEducation = pgTable('tbl_employee_education', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    qualificationLevel: qualificationLevelEnum('qualification_level').notNull(),
    qualificationTitle: varchar('qualification_title', { length: 255 }).notNull(),
    awardingInstitution: varchar('awarding_institution', { length: 255 }).notNull(),
    dateAwarded: date('date_awarded'),
    isOngoing: boolean('is_ongoing').default(false),
    remarks: text('remarks'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const employeeEducationRelations = relations(employeeEducation, ({ one }) => ({
    employee: one(users, {
        fields: [employeeEducation.employeeId],
        references: [users.employeeId],
    }),
}));

// Types
export type EmployeeEducation = typeof employeeEducation.$inferSelect;
export type NewEmployeeEducation = typeof employeeEducation.$inferInsert;
