import { pgTable, serial, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee as users } from '../../employees/employee.schema';

// Employee Communications Table
export const communications = pgTable('tbl_communications', {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
});

// One row per recipient - carries email delivery + response tracking so lead
// time (respondedAt - emailSentAt) can be computed per recipient.
export const communicationRecipients = pgTable('tbl_communication_recipients', {
    id: serial('id').primaryKey(),
    communicationId: integer('communication_id').notNull().references(() => communications.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    emailSentAt: timestamp('email_sent_at'),
    respondedAt: timestamp('responded_at'),
    responseText: text('response_text'),
});

export const communicationsRelations = relations(communications, ({ one, many }) => ({
    creator: one(users, { fields: [communications.createdBy], references: [users.id] }),
    recipients: many(communicationRecipients),
}));

export const communicationRecipientsRelations = relations(communicationRecipients, ({ one }) => ({
    communication: one(communications, { fields: [communicationRecipients.communicationId], references: [communications.id] }),
    user: one(users, { fields: [communicationRecipients.employeeId], references: [users.employeeId] }),
}));

export type Communication = typeof communications.$inferSelect;
export type NewCommunication = typeof communications.$inferInsert;
export type CommunicationRecipient = typeof communicationRecipients.$inferSelect;
export type NewCommunicationRecipient = typeof communicationRecipients.$inferInsert;
