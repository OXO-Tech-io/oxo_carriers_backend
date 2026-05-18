import { pgTable, serial, varchar, timestamp, text } from 'drizzle-orm/pg-core';

// Vendors Table (service providers separate from users)
export const vendors = pgTable('vendors', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    companyName: varchar('company_name', { length: 200 }).notNull(),
    contactNumber: varchar('contact_number', { length: 30 }),
    bankName: varchar('bank_name', { length: 150 }),
    accountHolderName: varchar('account_holder_name', { length: 150 }),
    accountNumber: varchar('account_number', { length: 80 }),
    bankBranch: varchar('bank_branch', { length: 150 }),
    serviceType: varchar('service_type', { length: 150 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Types
export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
