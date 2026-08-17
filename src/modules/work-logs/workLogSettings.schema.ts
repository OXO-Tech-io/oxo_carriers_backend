import { pgTable, serial, integer, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from '../../employees/employee.schema';

// Work Log Deadline Settings - a single organisation-wide row (id = 1, enforced
// by the singleton_guard CHECK in drizzle/0012_add_work_log_deadline.sql) that
// holds the daily cut-off time HR sets from the All Work Logs admin page.
//
// The deadline is a wall-clock time of day, not an instant, so it's stored as
// 'HH:MM' + an IANA timezone rather than a timestamp - resolving it against a
// given work date is WorkLogDeadlineService's job. It only applies to working
// days: Saturdays, Sundays, and any date on the leave calendar are exempt.
export const workLogSettings = pgTable('tbl_work_log_settings', {
    id: serial('id').primaryKey(),
    isEnabled: boolean('is_enabled').notNull().default(false),
    deadlineTime: varchar('deadline_time', { length: 5 }).notNull().default('18:00'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Colombo'),
    updatedBy: integer('updated_by').references(() => employee.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const workLogSettingsRelations = relations(workLogSettings, ({ one }) => ({
    updater: one(employee, { fields: [workLogSettings.updatedBy], references: [employee.id] }),
}));

export type WorkLogSettings = typeof workLogSettings.$inferSelect;
export type NewWorkLogSettings = typeof workLogSettings.$inferInsert;
