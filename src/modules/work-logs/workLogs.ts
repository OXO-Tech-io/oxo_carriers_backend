import { pgTable, serial, varchar, text, date, numeric, timestamp, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// Work Logs Table - one row per task per day, entered manually or via bulk
// Excel upload (see workLog.service.ts bulkUpload, mirroring the salary
// bulk-import exceljs pattern).
export const workLogs = pgTable('tbl_work_logs', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    workDate: date('work_date').notNull(),
    taskDescription: text('task_description').notNull(),
    hoursSpent: numeric('hours_spent', { precision: 5, scale: 2 }).notNull(),
    remarks: text('remarks'),
    // Submission deadline outcome, stamped at insert time by
    // WorkLogDeadlineService (see workLogSettings.ts). Late entries are
    // accepted, never rejected - the flag exists so HR can see lateness.
    // deadlineAt is null when no deadline applied (feature disabled, or the
    // work date fell on a weekend or a leave-calendar holiday).
    isLate: boolean('is_late').notNull().default(false),
    deadlineAt: timestamp('deadline_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const workLogsRelations = relations(workLogs, ({ one }) => ({
    user: one(users, { fields: [workLogs.employeeId], references: [users.employeeId] }),
}));

export type WorkLog = typeof workLogs.$inferSelect;
export type NewWorkLog = typeof workLogs.$inferInsert;
