import {
    pgTable,
    serial,
    integer,
    varchar,
    date,
    decimal,
    boolean,
    timestamp,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Enums
export const componentTypeEnum = pgEnum('component_type', ['earning', 'deduction']);
export const salaryStatusEnum = pgEnum('salary_status', ['generated', 'paid', 'pending']);

// Salary Components Table
export const salaryComponents = pgTable('salary_components', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    type: componentTypeEnum('type').notNull(),
    isDefault: boolean('is_default').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

// Employee Salary Structure Table
export const employeeSalaryStructure = pgTable('employee_salary_structure', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    componentId: integer('component_id').notNull().references(() => salaryComponents.id, { onDelete: 'cascade' }),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    isPercentage: boolean('is_percentage').default(false),
    percentageOf: varchar('percentage_of', { length: 100 }),
    effectiveDate: date('effective_date').notNull(),
    endDate: date('end_date'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Monthly Salaries Table
export const monthlySalaries = pgTable('monthly_salaries', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    monthYear: date('month_year').notNull(),
    basicSalary: decimal('basic_salary', { precision: 10, scale: 2 }).notNull(),
    localSalary: decimal('local_salary', { precision: 10, scale: 2 }).default('0'),
    oxoInternationalSalary: decimal('oxo_international_salary', { precision: 10, scale: 2 }).default('0'),
    totalEarnings: decimal('total_earnings', { precision: 10, scale: 2 }).notNull(),
    totalDeductions: decimal('total_deductions', { precision: 10, scale: 2 }).notNull(),
    netSalary: decimal('net_salary', { precision: 10, scale: 2 }).notNull(),
    status: salaryStatusEnum('status').default('generated'),
    generatedBy: integer('generated_by').references(() => users.id, { onDelete: 'set null' }),
    paidDate: date('paid_date'),
    pdfUrl: varchar('pdf_url', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Salary Slip Details Table
export const salarySlipDetails = pgTable('salary_slip_details', {
    id: serial('id').primaryKey(),
    salaryId: integer('salary_id').notNull().references(() => monthlySalaries.id, { onDelete: 'cascade' }),
    componentId: integer('component_id').notNull().references(() => salaryComponents.id, { onDelete: 'cascade' }),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    type: componentTypeEnum('type').notNull(),
});

// Relations
export const salaryComponentsRelations = relations(salaryComponents, ({ many }) => ({
    salaryStructures: many(employeeSalaryStructure),
    slipDetails: many(salarySlipDetails),
}));

export const employeeSalaryStructureRelations = relations(employeeSalaryStructure, ({ one }) => ({
    user: one(users, {
        fields: [employeeSalaryStructure.userId],
        references: [users.id],
    }),
    component: one(salaryComponents, {
        fields: [employeeSalaryStructure.componentId],
        references: [salaryComponents.id],
    }),
}));

export const monthlySalariesRelations = relations(monthlySalaries, ({ one, many }) => ({
    user: one(users, {
        fields: [monthlySalaries.userId],
        references: [users.id],
    }),
    generator: one(users, {
        fields: [monthlySalaries.generatedBy],
        references: [users.id],
    }),
    details: many(salarySlipDetails),
}));

export const salarySlipDetailsRelations = relations(salarySlipDetails, ({ one }) => ({
    salary: one(monthlySalaries, {
        fields: [salarySlipDetails.salaryId],
        references: [monthlySalaries.id],
    }),
    component: one(salaryComponents, {
        fields: [salarySlipDetails.componentId],
        references: [salaryComponents.id],
    }),
}));

// Types
export type SalaryComponent = typeof salaryComponents.$inferSelect;
export type NewSalaryComponent = typeof salaryComponents.$inferInsert;
export type EmployeeSalaryStructure = typeof employeeSalaryStructure.$inferSelect;
export type NewEmployeeSalaryStructure = typeof employeeSalaryStructure.$inferInsert;
export type MonthlySalary = typeof monthlySalaries.$inferSelect;
export type NewMonthlySalary = typeof monthlySalaries.$inferInsert;
export type SalarySlipDetail = typeof salarySlipDetails.$inferSelect;
export type NewSalarySlipDetail = typeof salarySlipDetails.$inferInsert;
