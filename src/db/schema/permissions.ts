import { pgTable, serial, integer, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from './employee';

// Enums
export const accessLevelEnum = pgEnum('access_level', ['read', 'write']);

// User Permissions Table
// Renamed user_permissions -> tbl_user_permissions by
// drizzle/0009_tbl_prefix_and_employee_type.sql.
export const userPermissions = pgTable('tbl_user_permissions', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 100 }).notNull(),
    accessLevel: accessLevelEnum('access_level').notNull().default('read'),
    assignedBy: integer('assigned_by').references(() => employee.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
    user: one(employee, {
        fields: [userPermissions.userId],
        references: [employee.id],
    }),
    assigner: one(employee, {
        fields: [userPermissions.assignedBy],
        references: [employee.id],
    }),
}));

export type UserPermission = typeof userPermissions.$inferSelect;
export type NewUserPermission = typeof userPermissions.$inferInsert;
