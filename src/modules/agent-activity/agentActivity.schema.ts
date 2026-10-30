import { pgTable, serial, varchar, timestamp, integer, bigint } from 'drizzle-orm/pg-core';
import { employee } from '../../employees/employee.schema';

// Mirrors drizzle/0031 + 0032 (agent activity logs). The agent's mediaTitle is
// intentionally not stored.
export const agentActivityLogs = pgTable('tbl_agent_activity_logs', {
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

export type AgentActivityLog = typeof agentActivityLogs.$inferSelect;
export type NewAgentActivityLog = typeof agentActivityLogs.$inferInsert;
