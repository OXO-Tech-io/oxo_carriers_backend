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
import { employee } from './employee';

// Enums
export const componentTypeEnum = pgEnum('component_type', ['earning', 'deduction']);
export const salaryStatusEnum = pgEnum('salary_status', ['generated', 'paid', 'pending']);

// Salary Components Table
export const salaryComponents = pgTable('tbl_salary_components', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    type: componentTypeEnum('type').notNull(),
    isDefault: boolean('is_default').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

// Employee Salary Structure Table
export const employeeSalaryStructure = pgTable('tbl_employee_salary_structure', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    componentId: integer('component_id').notNull().references(() => salaryComponents.id, { onDelete: 'cascade' }),
    amount: varchar('amount', { length: 500 }).notNull(),
    isPercentage: boolean('is_percentage').default(false),
    percentageOf: varchar('percentage_of', { length: 100 }),
    effectiveDate: date('effective_date').notNull(),
    endDate: date('end_date'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Monthly Salaries Table
export const monthlySalaries = pgTable('tbl_monthly_salaries', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    monthYear: date('month_year').notNull(),
    basicSalary: varchar('basic_salary', { length: 500 }).notNull(),
    localSalary: varchar('local_salary', { length: 500 }).default('0'),
    oxoInternationalSalary: varchar('oxo_international_salary', { length: 500 }).default('0'),
    totalEarnings: varchar('total_earnings', { length: 500 }).notNull(),
    totalDeductions: varchar('total_deductions', { length: 500 }).notNull(),
    netSalary: varchar('net_salary', { length: 500 }).notNull(),
    status: salaryStatusEnum('status').default('generated'),
    generatedBy: integer('generated_by').references(() => employee.id, { onDelete: 'set null' }),
    paidDate: date('paid_date'),
    pdfUrl: varchar('pdf_url', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Salary Slip Details Table
export const salarySlipDetails = pgTable('tbl_salary_slip_details', {
    id: serial('id').primaryKey(),
    salaryId: integer('salary_id').notNull().references(() => monthlySalaries.id, { onDelete: 'cascade' }),
    componentId: integer('component_id').notNull().references(() => salaryComponents.id, { onDelete: 'cascade' }),
    amount: varchar('amount', { length: 500 }).notNull(),
    type: componentTypeEnum('type').notNull(),
});

// Relations
export const salaryComponentsRelations = relations(salaryComponents, ({ many }) => ({
    salaryStructures: many(employeeSalaryStructure),
    slipDetails: many(salarySlipDetails),
}));

export const employeeSalaryStructureRelations = relations(employeeSalaryStructure, ({ one }) => ({
    user: one(employee, {
        fields: [employeeSalaryStructure.userId],
        references: [employee.id],
    }),
    component: one(salaryComponents, {
        fields: [employeeSalaryStructure.componentId],
        references: [salaryComponents.id],
    }),
}));

export const monthlySalariesRelations = relations(monthlySalaries, ({ one, many }) => ({
    user: one(employee, {
        fields: [monthlySalaries.userId],
        references: [employee.id],
    }),
    generator: one(employee, {
        fields: [monthlySalaries.generatedBy],
        references: [employee.id],
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
