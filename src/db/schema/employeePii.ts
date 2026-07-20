import {
    pgTable,
    serial,
    varchar,
    timestamp,
    customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Custom type for PostgreSQL bytea (binary data)
export const bytea = customType<{ data: Buffer; driverData: string | Buffer }>({
    dataType() {
        return 'bytea';
    },
    toDriver(val: Buffer) {
        return val;
    },
    fromDriver(val: unknown) {
        if (typeof val === 'string') {
            // Postgres node driver might return hex string like '\x010203'
            return Buffer.from(val.replace('\\x', ''), 'hex');
        }
        if (Buffer.isBuffer(val)) {
            return val;
        }
        throw new Error('Expected buffer or hex string from database');
    }
});

// Employee PII Table
// Holds sensitive fields (encrypted at rest via pgcrypto's pgp_sym_encrypt) that
// are only ever written through the ProfileChangeRequest approval workflow
// (see profileChangeRequest.service.ts). `address` is kept for backward
// compatibility but is superseded by the structured addressLine1/2/city/district
// columns below - new writes only ever populate the structured columns.
export const employeePii = pgTable('tbl_employee_pii', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .unique()
        .references(() => users.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    passportNumber: bytea('passport_number'),
    nationalId: bytea('national_id'),
    address: bytea('address'),
    addressLine1: bytea('address_line1'),
    addressLine2: bytea('address_line2'),
    city: bytea('city'),
    district: bytea('district'),
    bloodType: bytea('blood_type'),
    emergencyContactName: bytea('emergency_contact_name'),
    emergencyContactPhone: bytea('emergency_contact_phone'),
    emergencyContactRelationship: bytea('emergency_contact_relationship'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeePiiRelations = relations(employeePii, ({ one }) => ({
    employee: one(users, {
        fields: [employeePii.employeeId],
        references: [users.employeeId],
    }),
}));

export type EmployeePii = typeof employeePii.$inferSelect;
export type NewEmployeePii = typeof employeePii.$inferInsert;
