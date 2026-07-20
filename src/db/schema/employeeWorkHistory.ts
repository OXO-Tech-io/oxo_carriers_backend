import { pgTable, serial, integer, varchar, text, date, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Enums
export const employmentTypeEnum = pgEnum('employment_type', ['regular', 'intern', 'trainee']);

// Employee Work History Table
// Holds only the approved state of an employee's work history.
// Writes only ever happen via ProfileChangeRequest approval (see profileChangeRequests.ts).
export const employeeWorkHistory = pgTable('employee_work_history', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
        fields: [employeeWorkHistory.userId],
        references: [users.id],
    }),
}));

// Types
export type EmployeeWorkHistory = typeof employeeWorkHistory.$inferSelect;
export type NewEmployeeWorkHistory = typeof employeeWorkHistory.$inferInsert;
