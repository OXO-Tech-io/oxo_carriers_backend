import { pgTable, serial, integer, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Events Table - phase 1 is manual attendance recording by HR; a QR-based
// automated check-in is a planned phase 2, not modeled here.
export const events = pgTable('tbl_events', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    eventDate: timestamp('event_date').notNull(),
    location: varchar('location', { length: 255 }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const eventParticipants = pgTable('tbl_event_participants', {
    id: serial('id').primaryKey(),
    eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    participated: boolean('participated').notNull().default(false),
    // Stated intention ahead of the event, tracked separately from the actual
    // `participated` outcome above: null = no response, true = said they'd
    // attend, false = said they wouldn't. Lets HR see e.g. "said yes, no-showed".
    willParticipate: boolean('will_participate'),
    recordedBy: integer('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    recordedAt: timestamp('recorded_at').defaultNow(),
});

export const eventsRelations = relations(events, ({ one, many }) => ({
    creator: one(users, { fields: [events.createdBy], references: [users.id] }),
    participants: many(eventParticipants),
}));

export const eventParticipantsRelations = relations(eventParticipants, ({ one }) => ({
    event: one(events, { fields: [eventParticipants.eventId], references: [events.id] }),
    user: one(users, { fields: [eventParticipants.userId], references: [users.id] }),
}));

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventParticipant = typeof eventParticipants.$inferSelect;
export type NewEventParticipant = typeof eventParticipants.$inferInsert;
