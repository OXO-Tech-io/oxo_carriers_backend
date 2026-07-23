import { pgTable, serial, integer, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from './employee';

export const groups = pgTable('tbl_groups', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const groupMembers = pgTable('tbl_group_members', {
    id: serial('id').primaryKey(),
    groupId: integer('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    addedBy: integer('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at').defaultNow(),
}, (table) => ({
    groupUserUnique: uniqueIndex('tbl_group_members_group_id_user_id_idx').on(table.groupId, table.userId),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
    creator: one(users, { fields: [groups.createdBy], references: [users.id] }),
    members: many(groupMembers),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
    group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
    user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;
