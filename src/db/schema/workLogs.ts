import { pgTable, serial, varchar, text, date, numeric, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from './employee';

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
    createdAt: timestamp('created_at').defaultNow(),
});

export const workLogsRelations = relations(workLogs, ({ one }) => ({
    user: one(users, { fields: [workLogs.employeeId], references: [users.employeeId] }),
}));

export type WorkLog = typeof workLogs.$inferSelect;
export type NewWorkLog = typeof workLogs.$inferInsert;
