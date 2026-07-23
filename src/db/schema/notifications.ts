import { pgTable, serial, varchar, text, boolean, json, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from './employee';

// Notifications Table
// Generic in-app notification table shared by every module (not just profile change requests).
// `type` is a plain string (not a pgEnum) so future phases can add new notification types
// without a schema migration each time.
export const notifications = pgTable('tbl_notifications', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    payload: json('payload'),
    link: varchar('link', { length: 500 }),
    isRead: boolean('is_read').default(false),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const notificationsRelations = relations(notifications, ({ one }) => ({
    user: one(users, {
        fields: [notifications.employeeId],
        references: [users.employeeId],
    }),
}));

// Types
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
