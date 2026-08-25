import {
    pgTable,
    serial,
    varchar,
    text,
    boolean,
    timestamp,
    date,
    pgEnum,
    customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from './employee.schema';

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
    // legalName/initialsName/birthPlace/spouseName/motherName/fatherName
    // are encrypted like the rest of this table; dateOfBirth/sex/maritalStatus/
    // nationality stay plain since maritalStatus gates Tab C visibility and
    // dateOfBirth feeds a client-side age calculation.
    legalName: bytea('legal_name'),
    initialsName: bytea('initials_name'),
    callingName: bytea('calling_name'),
    dateOfBirth: date('date_of_birth'),
    birthPlace: bytea('birth_place'),
    sex: employeeSexEnum('sex'),
    maritalStatus: maritalStatusEnum('marital_status'),
    nationality: varchar('nationality', { length: 100 }),
    religion: varchar('religion', { length: 100 }),
    spouseName: bytea('spouse_name'),
    spouseNic: bytea('spouse_nic'),
    spouseDateOfBirth: date('spouse_date_of_birth'),
    spouseContactNumber: bytea('spouse_contact_number'),
    spouseOccupation: bytea('spouse_occupation'),
    motherName: bytea('mother_name'),
    motherOccupation: bytea('mother_occupation'),
    motherContactNumber: bytea('mother_contact_number'),
    fatherName: bytea('father_name'),
    fatherOccupation: bytea('father_occupation'),
    fatherContactNumber: bytea('father_contact_number'),
    siblingDetails: text('sibling_details'),
    primarySchool: varchar('primary_school', { length: 255 }),
    secondarySchool: varchar('secondary_school', { length: 255 }),
    // Tab B - residing address (if different from permanent) + landline
    residingAddressLine1: bytea('residing_address_line1'),
    residingAddressLine2: bytea('residing_address_line2'),
    residingCity: bytea('residing_city'),
    residingDistrict: bytea('residing_district'),
    landlineNumber: bytea('landline_number'),
    secondaryContactNumber: bytea('secondary_contact_number'),
    gramaNiladariDivision: bytea('grama_niladari_division'),
    // electorate/postalCode are administrative divisions, not identity/contact
    // secrets - not PII on their own, so plain.
    electorate: varchar('electorate', { length: 150 }),
    postalCode: varchar('postal_code', { length: 20 }),
    // Health (Tab D) - encrypted like the other PII above.
    medicalConditions: bytea('medical_conditions'),
    allergies: bytea('allergies'),
    // Social & declaration (Tab E) - linkedinProfile is not an identity/contact
    // secret, so plain; additionalNotes is free text employees can use to
    // disclose personal details, so encrypted like the rest of this table.
    linkedinProfile: varchar('linkedin_profile', { length: 255 }),
    additionalNotes: bytea('additional_notes'),
    // Set once at employee-creation time (see employeeProfileCreation.service.ts);
    // not editable afterwards via the change-request wizard.
    declarationAccepted: boolean('declaration_accepted').default(false),
    declarationAcceptedAt: timestamp('declaration_accepted_at'),
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
