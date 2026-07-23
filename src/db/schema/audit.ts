import { pgTable, serial, integer, varchar, text, timestamp, json } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from './employee';

// Audit Logs Table
// Renamed audit_logs -> tbl_audit_logs by drizzle/0009_tbl_prefix_and_employee_type.sql.
export const auditLogs = pgTable('tbl_audit_logs', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => employee.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    tableName: varchar('table_name', { length: 100 }),
    recordId: integer('record_id'),
    oldValues: json('old_values'),
    newValues: json('new_values'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    user: one(employee, {
        fields: [auditLogs.userId],
        references: [employee.id],
    }),
}));

// Types
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
