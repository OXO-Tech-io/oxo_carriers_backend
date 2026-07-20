import {
    pgTable,
    serial,
    varchar,
    timestamp,
    customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from './employee';

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

export const employeePii = pgTable('tbl_employee_pii', {
    id: serial('id').primaryKey(),
    employeeId: varchar('employee_id', { length: 50 })
        .notNull()
        .unique()
        .references(() => employee.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    passportNumber: bytea('passport_number'),
    nationalId: bytea('national_id'),
    address: bytea('address'),
    emergencyContactName: bytea('emergency_contact_name'),
    emergencyContactPhone: bytea('emergency_contact_phone'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeePiiRelations = relations(employeePii, ({ one }) => ({
    employee: one(employee, {
        fields: [employeePii.employeeId],
        references: [employee.employeeId],
    }),
}));

export type EmployeePii = typeof employeePii.$inferSelect;
export type NewEmployeePii = typeof employeePii.$inferInsert;
