import { pgTable, serial, varchar, text, date, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from './employee';

// Enums
export const employmentTypeEnum = pgEnum('employment_type', ['regular', 'intern', 'trainee']);

// Employee Work History Table
// Holds only the approved state of an employee's work history.
// Writes only ever happen via ProfileChangeRequest approval (see profileChangeRequests.ts).
export const employeeWorkHistory = pgTable('tbl_employee_work_history', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    organization: varchar('organization', { length: 255 }).notNull(),
    positionHeld: varchar('position_held', { length: 255 }).notNull(),
    employmentType: employmentTypeEnum('employment_type').notNull().default('regular'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'), // null = "Present"
    remarks: text('remarks'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const employeeWorkHistoryRelations = relations(employeeWorkHistory, ({ one }) => ({
    employee: one(users, {
        fields: [employeeWorkHistory.employeeId],
        references: [users.employeeId],
    }),
}));

// Types
export type EmployeeWorkHistory = typeof employeeWorkHistory.$inferSelect;
export type NewEmployeeWorkHistory = typeof employeeWorkHistory.$inferInsert;
