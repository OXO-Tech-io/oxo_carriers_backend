import {
    pgTable,
    serial,
    varchar,
    boolean,
    integer,
    timestamp,
    pgEnum,
    decimal,
    date,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', [
    'super_admin',
    'hr_manager',
    'hr_executive',
    'finance_manager',
    'finance_executive',
    'employee',
    'consultant',
    'service_provider',
]);

// Employee Types Table
export const employeeTypes = pgTable('tbl_employee_type', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(), // permanent, contract, consultation
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Employees Table
export const employees = pgTable('tbl_employee', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 }).unique(),
    email: varchar('email', { length: 100 }).notNull().unique(),
    password: varchar('password', { length: 255 }),
    keycloakSub: varchar('keycloak_sub', { length: 255 }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    emailVerified: boolean('email_verified').default(false),
    emailVerificationToken: varchar('email_verification_token', { length: 255 }),
    role: userRoleEnum('role').notNull(),
    employeeTypeId: integer('employee_type_id').references(() => employeeTypes.id),
    department: varchar('department', { length: 100 }),
    position: varchar('position', { length: 100 }),
    hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }),
    bankName: varchar('bank_name', { length: 150 }),
    accountHolderName: varchar('account_holder_name', { length: 150 }),
    accountNumber: varchar('account_number', { length: 80 }),
    bankBranch: varchar('bank_branch', { length: 150 }),
    companyName: varchar('company_name', { length: 200 }),
    contactNumber: varchar('contact_number', { length: 30 }),
    hireDate: date('hire_date'),
    managerId: integer('manager_id'),
    mustChangePassword: boolean('must_change_password').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Export users alias for backward compatibility with Drizzle relations and queries
export const users = employees;

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
    manager: one(users, {
        fields: [users.managerId],
        references: [users.id],
        relationName: 'manager',
    }),
    subordinates: many(users, { relationName: 'manager' }),
    employeeType: one(employeeTypes, {
        fields: [employees.employeeTypeId],
        references: [employeeTypes.id],
    }),
}));

export const employeeTypesRelations = relations(employeeTypes, ({ many }) => ({
    employees: many(employees),
}));

export type EmployeeType = typeof employeeTypes.$inferSelect;
export type NewEmployeeType = typeof employeeTypes.$inferInsert;
export type User = typeof employees.$inferSelect;
export type NewUser = typeof employees.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
