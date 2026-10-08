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
import { employee } from '../../employees/employee.schema';
import { vendors } from '../vendors/vendors.schema';

// Enums
export const voucherStatusEnum = pgEnum('voucher_status', ['pending', 'approved', 'rejected', 'paid']);
export const voucherTypeEnum = pgEnum('voucher_type', ['employee', 'vendor']);

// Renamed payment_vouchers -> tbl_payment_vouchers by
// drizzle/0009_tbl_prefix_and_employee_type.sql.
// Payment Vouchers Table
export const paymentVouchers = pgTable('tbl_payment_vouchers', {
    id: serial('id').primaryKey(),
    voucherType: voucherTypeEnum('voucher_type').notNull(),
    employeeId: varchar('employee_id', { length: 50 }).references(() => employee.employeeId, {
        onDelete: 'set null',
        onUpdate: 'cascade',
    }),
    vendorId: integer('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    description: text('description').notNull(),
    invoiceNumber: varchar('invoice_number', { length: 100 }),
    invoiceDate: date('invoice_date'),
    dueDate: date('due_date'),
    status: voucherStatusEnum('status').default('pending'),
    attachmentUrl: varchar('attachment_url', { length: 500 }),
    reviewedBy: integer('reviewed_by').references(() => employee.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    paidDate: date('paid_date'),
    paymentReference: varchar('payment_reference', { length: 200 }),
    notes: text('notes'),
    createdBy: integer('created_by').references(() => employee.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const paymentVouchersRelations = relations(paymentVouchers, ({ one }) => ({
    user: one(employee, {
        fields: [paymentVouchers.employeeId],
        references: [employee.employeeId],
    }),
    vendor: one(vendors, {
        fields: [paymentVouchers.vendorId],
        references: [vendors.id],
    }),
    reviewer: one(employee, {
        fields: [paymentVouchers.reviewedBy],
        references: [employee.id],
    }),
    creator: one(employee, {
        fields: [paymentVouchers.createdBy],
        references: [employee.id],
    }),
}));

// Types
export type PaymentVoucher = typeof paymentVouchers.$inferSelect;
export type NewPaymentVoucher = typeof paymentVouchers.$inferInsert;
