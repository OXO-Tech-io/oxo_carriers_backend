import {
    pgTable,
    serial,
    varchar,
    timestamp,
    date,
    pgEnum,
    customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from '../../employees/employee.schema';

// Enums
export const employeeSexEnum = pgEnum('employee_sex', ['male', 'female']);
export const maritalStatusEnum = pgEnum('marital_status', ['married', 'single']);

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
        .references(() => employee.employeeId, { onDelete: 'cascade', onUpdate: 'cascade' }),
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
    // Statutory (Tab 1) fields - added for the EPF/ETF profile enhancement.
    // fullNameAsNic/nameWithInitials/birthPlace/spouseName/motherName/fatherName
    // are encrypted like the rest of this table; dateOfBirth/sex/maritalStatus/
    // nationality stay plain since maritalStatus gates Tab C visibility and
    // dateOfBirth feeds a client-side age calculation.
    fullNameAsNic: bytea('full_name_as_nic'),
    nameWithInitials: bytea('name_with_initials'),
    dateOfBirth: date('date_of_birth'),
    birthPlace: bytea('birth_place'),
    sex: employeeSexEnum('sex'),
    maritalStatus: maritalStatusEnum('marital_status'),
    nationality: varchar('nationality', { length: 100 }),
    spouseName: bytea('spouse_name'),
    motherName: bytea('mother_name'),
    fatherName: bytea('father_name'),
    // Tab B - residing address (if different from permanent) + landline
    residingAddressLine1: bytea('residing_address_line1'),
    residingAddressLine2: bytea('residing_address_line2'),
    residingCity: bytea('residing_city'),
    residingDistrict: bytea('residing_district'),
    landlineNumber: bytea('landline_number'),
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
