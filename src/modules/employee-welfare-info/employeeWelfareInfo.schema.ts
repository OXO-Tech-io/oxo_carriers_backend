import { pgTable, serial, varchar, date, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// Employee Welfare Info Table (Tab E). One row per employee - all plain
// columns since none of these fields are identity/contact secrets. Writes
// only ever happen via ProfileChangeRequest approval (see profileChangeRequests.ts).
export const employeeWelfareInfo = pgTable('tbl_employee_welfare_info', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .unique()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    weddingAnniversaryDate: date('wedding_anniversary_date'),
    hobbies: text('hobbies'),
    communityActivities: text('community_activities'),
    professionalMemberships: text('professional_memberships'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeeWelfareInfoRelations = relations(employeeWelfareInfo, ({ one }) => ({
    employee: one(users, {
        fields: [employeeWelfareInfo.employeeId],
        references: [users.employeeId],
    }),
}));

export type EmployeeWelfareInfo = typeof employeeWelfareInfo.$inferSelect;
export type NewEmployeeWelfareInfo = typeof employeeWelfareInfo.$inferInsert;
