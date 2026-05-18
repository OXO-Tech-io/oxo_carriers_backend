import {
    pgTable,
    serial,
    integer,
    varchar,
    text,
    decimal,
    date,
    timestamp,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { vendors } from './vendors';

// Enums
export const voucherStatusEnum = pgEnum('voucher_status', ['pending', 'approved', 'rejected', 'paid']);
export const voucherTypeEnum = pgEnum('voucher_type', ['employee', 'vendor']);

// Payment Vouchers Table
export const paymentVouchers = pgTable('payment_vouchers', {
    id: serial('id').primaryKey(),
    voucherType: voucherTypeEnum('voucher_type').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    vendorId: integer('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    description: text('description').notNull(),
    invoiceNumber: varchar('invoice_number', { length: 100 }),
    invoiceDate: date('invoice_date'),
    dueDate: date('due_date'),
    status: voucherStatusEnum('status').default('pending'),
    attachmentUrl: varchar('attachment_url', { length: 500 }),
    reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    paidDate: date('paid_date'),
    paymentReference: varchar('payment_reference', { length: 200 }),
    notes: text('notes'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const paymentVouchersRelations = relations(paymentVouchers, ({ one }) => ({
    user: one(users, {
        fields: [paymentVouchers.userId],
        references: [users.id],
    }),
    vendor: one(vendors, {
        fields: [paymentVouchers.vendorId],
        references: [vendors.id],
    }),
    reviewer: one(users, {
        fields: [paymentVouchers.reviewedBy],
        references: [users.id],
    }),
    creator: one(users, {
        fields: [paymentVouchers.createdBy],
        references: [users.id],
    }),
}));

// Types
export type PaymentVoucher = typeof paymentVouchers.$inferSelect;
export type NewPaymentVoucher = typeof paymentVouchers.$inferInsert;
