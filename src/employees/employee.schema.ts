import {
    pgTable,
    serial,
    varchar,
    integer,
    timestamp,
    pgEnum,
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

export const userTitleEnum = pgEnum('user_title', ['mr', 'ms', 'mrs', 'dr', 'prof']);

export const employeeStatusEnum = pgEnum('employee_status', ['active', 'inactive', 'on_hold']);

// Employee Type Table (e.g. permanent, contract, intern)
export const employeeType = pgTable('tbl_employee_type', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Employees Table (formerly `users`)
export const employee = pgTable('tbl_employee', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 }).unique(),
    // email/firstName/lastName are encrypted at rest (encryptPII) - widened to
    // fit ciphertext, same as the other PII columns below. Encryption is
    // non-deterministic (random IV per call), so equality lookups can't use
    // this column directly - emailHash (deterministic, keyed HMAC) is the
    // lookup/uniqueness key instead. See EmployeeModel.findByEmail/hashEmail.
    email: varchar('email', { length: 500 }).notNull(),
    emailHash: varchar('email_hash', { length: 64 }).notNull().unique(),
    keycloakSub: varchar('keycloak_sub', { length: 255 }),
    firstName: varchar('first_name', { length: 500 }).notNull(),
    lastName: varchar('last_name', { length: 500 }).notNull(),
    role: userRoleEnum('role').notNull(),
    // Controls login: JwtAuthGuard rejects non-'active' employees even with a
    // still-valid JWT, and the Keycloak account itself is disabled alongside
    // this (see keycloakAdminService.setEnabled) so inactive/on_hold users
    // can't get past the SSO login screen either.
    status: employeeStatusEnum('status').notNull().default('active'),
    title: userTitleEnum('title'),
    employeeTypeId: integer('employee_type_id').references(() => employeeType.id),
    department: varchar('department', { length: 100 }),
    position: varchar('position', { length: 100 }),
    hourlyRate: varchar('hourly_rate', { length: 500 }),
    bankName: varchar('bank_name', { length: 500 }),
    accountHolderName: varchar('account_holder_name', { length: 500 }),
    accountNumber: varchar('account_number', { length: 500 }),
    bankBranch: varchar('bank_branch', { length: 500 }),
    bankBranchCode: varchar('bank_branch_code', { length: 500 }),
    swiftCode: varchar('swift_code', { length: 500 }),
    companyName: varchar('company_name', { length: 500 }),
    contactNumber: varchar('contact_number', { length: 500 }),
    undergraduateDegreeCompletionDate: date('undergraduate_degree_completion_date'),
    hireDate: date('hire_date'),
    managerId: integer('manager_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee relations
export const employeeRelations = relations(employee, ({ one, many }) => ({
    manager: one(employee, {
        fields: [employee.managerId],
        references: [employee.id],
        relationName: 'manager',
    }),
    subordinates: many(employee, { relationName: 'manager' }),
    employeeType: one(employeeType, {
        fields: [employee.employeeTypeId],
        references: [employeeType.id],
    }),
}));

export const employeeTypeRelations = relations(employeeType, ({ many }) => ({
    employees: many(employee),
}));

export type Employee = typeof employee.$inferSelect;
export type NewEmployee = typeof employee.$inferInsert;
export type EmployeeType = typeof employeeType.$inferSelect;
export type NewEmployeeType = typeof employeeType.$inferInsert;
