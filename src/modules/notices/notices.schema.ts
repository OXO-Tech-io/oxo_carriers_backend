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
    // OCD-565: scheduling window - a notice only actually displays (see
    // NoticesService.listActive()) once `isActive` is true AND the current
    // time falls between startAt and endAt. Both stay nullable at the DB
    // level so this never breaks existing rows: startAt defaults to now()
    // so pre-existing notices keep displaying immediately after the
    // migration runs (see src/scripts/addNoticeScheduleFields.ts), while the
    // DTO requires it for NEW notices going forward. A null endAt means the
    // notice never expires.
    startAt: timestamp('start_at').defaultNow(),
    endAt: timestamp('end_at'),
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
