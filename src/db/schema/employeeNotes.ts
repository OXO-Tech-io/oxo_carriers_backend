import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Employee Notes Table
//
// HR Team (hr_executive) can create notes but is deliberately given no
// read/update route at all afterwards - enforced in employeeNoteRoutes.ts,
// not in this schema. Only HR Manager (and super_admin) can list/view/edit.
export const employeeNotes = pgTable('tbl_employee_notes', {
    id: serial('id').primaryKey(),
    employeeUserId: integer('employee_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    authorUserId: integer('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeeNotesRelations = relations(employeeNotes, ({ one }) => ({
    employee: one(users, {
        fields: [employeeNotes.employeeUserId],
        references: [users.id],
        relationName: 'employeeNoteSubject',
    }),
    author: one(users, {
        fields: [employeeNotes.authorUserId],
        references: [users.id],
        relationName: 'employeeNoteAuthor',
    }),
}));

export type EmployeeNote = typeof employeeNotes.$inferSelect;
export type NewEmployeeNote = typeof employeeNotes.$inferInsert;
