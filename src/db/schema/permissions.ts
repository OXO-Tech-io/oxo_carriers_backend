import { pgTable, serial, integer, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Enums
export const accessLevelEnum = pgEnum('access_level', ['read', 'write']);

// User Permissions Table
export const userPermissions = pgTable('user_permissions', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 }).notNull().references(() => users.employeeId, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 100 }).notNull(),
    accessLevel: accessLevelEnum('access_level').notNull().default('read'),
    assignedBy: integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
    user: one(users, {
        fields: [userPermissions.employeeId],
        references: [users.employeeId],
    }),
    assigner: one(users, {
        fields: [userPermissions.assignedBy],
        references: [users.id],
    }),
}));

export type UserPermission = typeof userPermissions.$inferSelect;
export type NewUserPermission = typeof userPermissions.$inferInsert;
