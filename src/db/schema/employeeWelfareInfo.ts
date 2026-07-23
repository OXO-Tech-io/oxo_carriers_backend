import { pgTable, serial, integer, date, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Employee Welfare Info Table (Tab E). One row per employee - all plain
// columns since none of these fields are identity/contact secrets. Writes
// only ever happen via ProfileChangeRequest approval (see profileChangeRequests.ts).
export const employeeWelfareInfo = pgTable('employee_welfare_info', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    weddingAnniversaryDate: date('wedding_anniversary_date'),
    hobbies: text('hobbies'),
    communityActivities: text('community_activities'),
    professionalMemberships: text('professional_memberships'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeeWelfareInfoRelations = relations(employeeWelfareInfo, ({ one }) => ({
    employee: one(users, {
        fields: [employeeWelfareInfo.userId],
        references: [users.id],
    }),
}));

export type EmployeeWelfareInfo = typeof employeeWelfareInfo.$inferSelect;
export type NewEmployeeWelfareInfo = typeof employeeWelfareInfo.$inferInsert;
