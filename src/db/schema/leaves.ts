import {
    pgTable,
    serial,
    integer,
    varchar,
    text,
    boolean,
    date,
    decimal,
    timestamp,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from './employee';

// Enums
export const leaveStatusEnum = pgEnum('leave_status', [
    'pending',
    'team_leader_approved',
    'hr_approved',
    'rejected',
    'cancelled',
]);

export const halfDayPeriodEnum = pgEnum('half_day_period', ['morning', 'evening']);

// Renamed leave_types/employee_leave_balance/leave_requests/leave_calendar to
// their tbl_ equivalents by drizzle/0009_tbl_prefix_and_employee_type.sql.
// Leave Types Table
export const leaveTypes = pgTable('tbl_leave_types', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 50 }).notNull(),
    description: text('description'),
    maxDays: integer('max_days').notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

// Employee Leave Balance Table
export const employeeLeaveBalance = pgTable('tbl_employee_leave_balance', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id, { onDelete: 'cascade' }),
    totalDays: decimal('total_days', { precision: 5, scale: 2 }).default('0'),
    usedDays: decimal('used_days', { precision: 5, scale: 2 }).default('0'),
    remainingDays: decimal('remaining_days', { precision: 5, scale: 2 }).default('0'),
    year: integer('year').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Leave Requests Table
export const leaveRequests = pgTable('tbl_leave_requests', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id, { onDelete: 'cascade' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    totalDays: decimal('total_days', { precision: 5, scale: 2 }).notNull(),
    isHalfDay: boolean('is_half_day').default(false),
    halfDayPeriod: halfDayPeriodEnum('half_day_period'),
    reason: text('reason'),
    status: leaveStatusEnum('status').default('pending'),
    teamLeaderApprovalDate: timestamp('team_leader_approval_date'),
    hrApprovalDate: timestamp('hr_approval_date'),
    rejectionReason: text('rejection_reason'),
    attachmentUrl: varchar('attachment_url', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Leave Calendar Table
export const leaveCalendar = pgTable('tbl_leave_calendar', {
    id: serial('id').primaryKey(),
    date: date('date').notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    isRecurring: boolean('is_recurring').default(false),
    year: integer('year'),
    createdBy: integer('created_by').references(() => employee.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const leaveTypesRelations = relations(leaveTypes, ({ many }) => ({
    leaveBalances: many(employeeLeaveBalance),
    leaveRequests: many(leaveRequests),
}));

export const employeeLeaveBalanceRelations = relations(employeeLeaveBalance, ({ one }) => ({
    user: one(employee, {
        fields: [employeeLeaveBalance.userId],
        references: [employee.id],
    }),
    leaveType: one(leaveTypes, {
        fields: [employeeLeaveBalance.leaveTypeId],
        references: [leaveTypes.id],
    }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
    user: one(employee, {
        fields: [leaveRequests.userId],
        references: [employee.id],
    }),
    leaveType: one(leaveTypes, {
        fields: [leaveRequests.leaveTypeId],
        references: [leaveTypes.id],
    }),
}));

export const leaveCalendarRelations = relations(leaveCalendar, ({ one }) => ({
    creator: one(employee, {
        fields: [leaveCalendar.createdBy],
        references: [employee.id],
    }),
}));

// Types
export type LeaveType = typeof leaveTypes.$inferSelect;
export type NewLeaveType = typeof leaveTypes.$inferInsert;
export type EmployeeLeaveBalance = typeof employeeLeaveBalance.$inferSelect;
export type NewEmployeeLeaveBalance = typeof employeeLeaveBalance.$inferInsert;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;
export type LeaveCalendar = typeof leaveCalendar.$inferSelect;
export type NewLeaveCalendar = typeof leaveCalendar.$inferInsert;
