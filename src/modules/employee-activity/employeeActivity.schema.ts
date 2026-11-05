import { pgTable, serial, varchar, timestamp, integer, bigint } from 'drizzle-orm/pg-core';
import { employee } from '../../employees/employee.schema';
import { bytea } from '../../employees/employeePii.schema';

// Mirrors drizzle/0031 + 0032 (employee activity logs). The agent's mediaTitle is
// intentionally not stored.
export const employeeActivityLogs = pgTable('tbl_employee_activity_logs', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => employee.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    deviceId: varchar('device_id', { length: 100 }).notNull(),
    agentLogId: bigint('agent_log_id', { mode: 'number' }).notNull(),
    eventType: varchar('event_type', { length: 30 }).notNull(),
    startTs: timestamp('start_ts', { withTimezone: true }).notNull(),
    appName: varchar('app_name', { length: 255 }),
    mouseEventCount: integer('mouse_event_count').notNull().default(0),
    keyEventCount: integer('key_event_count').notNull().default(0),
    windowTitle: varchar('window_title', { length: 500 }),
    mediaState: varchar('media_state', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow(),
});

export type EmployeeActivityLog = typeof employeeActivityLogs.$inferSelect;
export type NewEmployeeActivityLog = typeof employeeActivityLogs.$inferInsert;

// Mirrors drizzle/0033 (renamed in 0036). Image bytes for the `screenshot` rows above.
export const employeeScreenshots = pgTable('tbl_employee_screenshots', {
    id: serial('id').primaryKey(),
    activityLogId: integer('activity_log_id')
        .notNull()
        .references(() => employeeActivityLogs.id, { onDelete: 'cascade' }),
    mimeType: varchar('mime_type', { length: 50 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: varchar('sha256', { length: 64 }),
    // Null once the image is in GCS (drizzle/0034) - then objectKey points at it.
    content: bytea('content'),
    objectKey: varchar('object_key', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Mirrors drizzle/0035 (renamed in 0037). Hashed device credentials for the agent's direct API calls.
export const employeeDeviceTokens = pgTable('tbl_employee_device_tokens', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => employee.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    deviceId: varchar('device_id', { length: 100 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
});
