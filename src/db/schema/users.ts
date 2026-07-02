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

// Users Table
export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 }).unique(),
    email: varchar('email', { length: 100 }).notNull().unique(),
    keycloakSub: varchar('keycloak_sub', { length: 255 }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    emailVerified: boolean('email_verified').default(false),
    emailVerificationToken: varchar('email_verification_token', { length: 255 }),
    role: userRoleEnum('role').notNull(),
    department: varchar('department', { length: 100 }),
    position: varchar('position', { length: 100 }),
    hourlyRate: varchar('hourly_rate', { length: 500 }),
    bankName: varchar('bank_name', { length: 500 }),
    accountHolderName: varchar('account_holder_name', { length: 500 }),
    accountNumber: varchar('account_number', { length: 500 }),
    bankBranch: varchar('bank_branch', { length: 500 }),
    companyName: varchar('company_name', { length: 500 }),
    contactNumber: varchar('contact_number', { length: 500 }),
    hireDate: date('hire_date'),
    managerId: integer('manager_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// User relations
export const usersRelations = relations(users, ({ one, many }) => ({
    manager: one(users, {
        fields: [users.managerId],
        references: [users.id],
        relationName: 'manager',
    }),
    subordinates: many(users, { relationName: 'manager' }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
