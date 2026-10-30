import { pgTable, serial, varchar, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from '../../employees/employee.schema';

// Mirrors drizzle/0013_add_attendance_tracking.sql's tbl_attendance exactly.
// Only this table has application code on top of it so far - the migration's
// other five tables exist in the DB for the fuller time tracker but are
// unused by this module for now.
export const employeeWorkSessions = pgTable('tbl_attendance', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => employee.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    sessionToken: varchar('session_token', { length: 100 }).notNull().unique(),
    loginAt: timestamp('login_at').defaultNow(),
    logoutAt: timestamp('logout_at'),
    lastHeartbeatAt: timestamp('last_heartbeat_at').defaultNow(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    endReason: varchar('end_reason', { length: 30 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    browser: varchar('browser', { length: 100 }),
    os: varchar('os', { length: 100 }),
    deviceType: varchar('device_type', { length: 30 }),
    timezone: varchar('timezone', { length: 64 }),
    totalDurationSec: integer('total_duration_sec'),
    activeSec: integer('active_sec'),
    idleSec: integer('idle_sec'),
    productiveSec: integer('productive_sec'),
    unproductiveSec: integer('unproductive_sec'),
    isLate: boolean('is_late').notNull().default(false),
    isEarlyLogout: boolean('is_early_logout').notNull().default(false),
    terminatedByEmployeeId: varchar('terminated_by_employee_id', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const employeeWorkSessionsRelations = relations(employeeWorkSessions, ({ one }) => ({
    employee: one(employee, {
        fields: [employeeWorkSessions.employeeId],
        references: [employee.employeeId],
    }),
}));

export type EmployeeWorkSession = typeof employeeWorkSessions.$inferSelect;
export type NewEmployeeWorkSession = typeof employeeWorkSessions.$inferInsert;

// Mirrors drizzle/0024_add_device_id_and_break_tracking.sql's tbl_employee_break_logs
// exactly. One row per break; breakEnd null means the break is still open - same
// convention as tbl_employee_idle_logs from 0013 (unused by this module, see above).
export const employeeBreakLogs = pgTable('tbl_employee_break_logs', {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
        .notNull()
        .references(() => employeeWorkSessions.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => employee.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    breakStart: timestamp('break_start').defaultNow(),
    breakEnd: timestamp('break_end'),
    durationSec: integer('duration_sec'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const employeeBreakLogsRelations = relations(employeeBreakLogs, ({ one }) => ({
    session: one(employeeWorkSessions, {
        fields: [employeeBreakLogs.sessionId],
        references: [employeeWorkSessions.id],
    }),
    employee: one(employee, {
        fields: [employeeBreakLogs.employeeId],
        references: [employee.employeeId],
    }),
}));

export type EmployeeBreakLog = typeof employeeBreakLogs.$inferSelect;
export type NewEmployeeBreakLog = typeof employeeBreakLogs.$inferInsert;
