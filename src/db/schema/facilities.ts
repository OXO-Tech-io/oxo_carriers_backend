import {
    pgTable,
    serial,
    integer,
    varchar,
    text,
    boolean,
    timestamp,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Enums
export const facilityTypeEnum = pgEnum('facility_type', [
    'workstation',
    'board_room',
    'meeting_room',
    'accommodation',
]);

export const bookingStatusEnum = pgEnum('booking_status', [
    'pending',
    'confirmed',
    'cancelled',
    'completed',
]);

// Facilities Table
export const facilities = pgTable('facilities', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    type: facilityTypeEnum('type').notNull(),
    description: text('description'),
    facilities: text('facilities'),
    capacity: integer('capacity').default(1),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Facility Bookings Table
export const facilityBookings = pgTable('facility_bookings', {
    id: serial('id').primaryKey(),
    facilityId: integer('facility_id').notNull().references(() => facilities.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time').notNull(),
    purpose: text('purpose'),
    status: bookingStatusEnum('status').default('confirmed'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const facilitiesRelations = relations(facilities, ({ many }) => ({
    bookings: many(facilityBookings),
}));

export const facilityBookingsRelations = relations(facilityBookings, ({ one }) => ({
    facility: one(facilities, {
        fields: [facilityBookings.facilityId],
        references: [facilities.id],
    }),
    user: one(users, {
        fields: [facilityBookings.userId],
        references: [users.id],
    }),
}));

// Types
export type Facility = typeof facilities.$inferSelect;
export type NewFacility = typeof facilities.$inferInsert;
export type FacilityBooking = typeof facilityBookings.$inferSelect;
export type NewFacilityBooking = typeof facilityBookings.$inferInsert;
