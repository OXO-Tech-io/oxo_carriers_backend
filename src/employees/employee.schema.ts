import {
    pgTable,
    serial,
    varchar,
    integer,
    timestamp,
    pgEnum,
    date,
    text,
    boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const employeeSexEnum = pgEnum('employee_sex', ['male', 'female']);
export const maritalStatusEnum = pgEnum('marital_status', ['married', 'single']);

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

// Internal vs Client Side classification - drives whether a coverup employee
// is required when this employee submits a leave request (see leave.service.ts).
// Nullable: existing rows predate this field and can't be backfilled; it's
// only enforced as required at employee-creation time going forward.
export const employeeCategoryEnum = pgEnum('employee_category', ['internal', 'client_side']);

export const workLocationEnum = pgEnum('work_location', ['office', 'remote', 'hybrid']);

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
    employeeCategory: employeeCategoryEnum('employee_category'),
    department: varchar('department', { length: 100 }),
    position: varchar('position', { length: 100 }),
    workLocation: workLocationEnum('work_location'),
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
    // Non-PII personal/statutory attributes - moved off tbl_employee_pii since
    // they were always stored plain there (never pgcrypto-encrypted like the
    // rest of that table). dateOfBirth feeds a client-side age calculation and
    // maritalStatus gates Tab C (dependents) visibility, same as before the move.
    dateOfBirth: date('date_of_birth'),
    sex: employeeSexEnum('sex'),
    maritalStatus: maritalStatusEnum('marital_status'),
    nationality: varchar('nationality', { length: 100 }),
    religion: varchar('religion', { length: 100 }),
    spouseDateOfBirth: date('spouse_date_of_birth'),
    siblingDetails: text('sibling_details'),
    primarySchool: varchar('primary_school', { length: 255 }),
    secondarySchool: varchar('secondary_school', { length: 255 }),
    gramaNiladariDivision: varchar('grama_niladari_division', { length: 150 }),
    electorate: varchar('electorate', { length: 150 }),
    postalCode: varchar('postal_code', { length: 20 }),
    linkedinProfile: varchar('linkedin_profile', { length: 255 }),
    declarationAccepted: boolean('declaration_accepted').default(false),
    declarationAcceptedAt: timestamp('declaration_accepted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    // Set when UsersService.delete() removes the employee. Distinct from
    // `status` (which HR also sets to 'inactive' for employees who are still
    // employed but on hold) so removed employees can be excluded from
    // EmployeeModel.getAll() without hiding merely-deactivated ones.
    deletedAt: timestamp('deleted_at'),
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
