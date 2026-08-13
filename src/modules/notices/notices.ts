import { pgTable, serial, varchar, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// Notice board announcements - distinct from tbl_notifications (which is a
// per-employee inbox row). A notice is a single broadcast row that every
// employee/system user sees on their dashboard; only holders of the
// `notices` permission (write) or super_admin can create/update/delete one.
export const notices = pgTable('tbl_notices', {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    imageUrl: varchar('image_url', { length: 500 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const noticesRelations = relations(notices, ({ one }) => ({
    creator: one(users, { fields: [notices.createdBy], references: [users.id] }),
    updater: one(users, { fields: [notices.updatedBy], references: [users.id] }),
}));

export type Notice = typeof notices.$inferSelect;
export type NewNotice = typeof notices.$inferInsert;
