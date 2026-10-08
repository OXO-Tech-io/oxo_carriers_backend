import { pgTable, serial, integer, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from '../../employees/employee.schema';

// Enums
export const accessLevelEnum = pgEnum('access_level', ['read', 'write']);

// User Permissions Table
// Renamed user_permissions -> tbl_user_permissions by
// drizzle/0009_tbl_prefix_and_employee_type.sql.
export const userPermissions = pgTable('tbl_user_permissions', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => employee.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 100 }).notNull(),
    accessLevel: accessLevelEnum('access_level').notNull().default('read'),
    assignedBy: integer('assigned_by').references(() => employee.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Role Default Permissions Table
// Admin-editable "template" of what a newly created (or role-changed) user
// gets granted by default, keyed by role. Previously hardcoded as the
// DEFAULT_PERMISSIONS_BY_ROLE constant; now DB-backed and editable via
// PUT /permissions/roles/:role (see permissions.service.ts). A role with no
// rows here (SUPER_ADMIN, SERVICE_PROVIDER) simply has no defaults applied -
// SUPER_ADMIN bypasses the permission table entirely regardless.
export const rolePermissions = pgTable('tbl_role_permissions', {
    id: serial('id').primaryKey(),
    role: varchar('role', { length: 50 }).notNull(),
    permissionKey: varchar('permission_key', { length: 100 }).notNull(),
    accessLevel: accessLevelEnum('access_level').notNull().default('read'),
    updatedBy: integer('updated_by').references(() => employee.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
    user: one(employee, {
        fields: [userPermissions.employeeId],
        references: [employee.employeeId],
    }),
    assigner: one(employee, {
        fields: [userPermissions.assignedBy],
        references: [employee.id],
    }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
    updater: one(employee, {
        fields: [rolePermissions.updatedBy],
        references: [employee.id],
    }),
}));

export type UserPermission = typeof userPermissions.$inferSelect;
export type NewUserPermission = typeof userPermissions.$inferInsert;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
