import { z } from 'zod';
import {
  nomineeValueSchema,
  dependentValueSchema,
  emergencyContactRecordValueSchema,
  sexValues,
  maritalStatusValues,
  bloodTypeValues,
} from './profileChangeRequest.validator';
import { educationAfterSchema } from './employeeEducation.validator';
import { workHistoryAfterSchema } from './employeeWorkHistory.validator';

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
// OCD-417: mirrors noFutureDate in lib/validation/textValidation.ts (frontend).
const notFutureDateString = isoDateString.refine(
  (value) => new Date(value).getTime() <= Date.now(),
  { message: 'Date cannot be a future date. Please enter a valid date.' }
);

// OCD-416/OCD-419/OCD-420/OCD-427/OCD-433: mirror the frontend's
// NIC_PATTERN/LOCATION_NAME_PATTERN/MOBILE_NUMBER_PATTERN/PHONE_NUMBER_PATTERN/
// POSTAL_CODE_PATTERN/LINKEDIN_URL_PATTERN in lib/validation/textValidation.ts.
const NIC_REGEX = /^(\d{9}[VvXx]|\d{12})$/;
const LOCATION_NAME_REGEX = /^[A-Za-zÀ-ɏ\s'.-]+$/;
// Accepts local (0XXXXXXXXX) or international (+94XXXXXXXXX) format - see
// profileChangeRequest.validator.ts's identical widening for why.
const PHONE_REGEX = /^(0\d{9}|\+94\d{9})$/;
const POSTAL_CODE_REGEX = /^\d{5}$/;
const LINKEDIN_URL_REGEX = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Z0-9\-_%]+\/?$/i;

const nicField = (label: string) => z.string().min(1, `${label} is required`).max(20).regex(NIC_REGEX, `${label} must be a valid Sri Lankan NIC number`);
const optionalNicField = (label: string) =>
  z.string().max(20).nullable().optional().refine((v) => !v || NIC_REGEX.test(v), { message: `${label} must be a valid Sri Lankan NIC number` });
const locationNameField = (label: string) =>
  z.string().min(1, `${label} is required`).max(150).regex(LOCATION_NAME_REGEX, `${label} must contain only letters, spaces, apostrophes, periods and hyphens`);
const optionalPhoneField = (label: string) =>
  z.string().max(30).nullable().optional().refine((v) => !v || PHONE_REGEX.test(v), { message: `${label} must be a valid phone number` });

// Mirrors StepStatutory.tsx's required fields exactly - filled in by HR at
// employee-creation time instead of via the employee's own change-request wizard.
const statutorySchema = z
  .object({
    nationalId: nicField('NIC number'),
    legalName: z.string().min(1, 'Full name is required').max(255),
    initialsName: z.string().min(1, 'Name with initials is required').max(255),
    callingName: z.string().min(1, 'Calling name is required').max(255).nullable().optional(),
    addressLine1: z.string().min(1, 'Address line 1 is required').max(255),
    addressLine2: z.string().max(255).nullable().optional(),
    city: locationNameField('City'),
    district: locationNameField('District'),
    gramaNiladariDivision: locationNameField('Grama Niladhari Division').nullable().optional(),
    electorate: locationNameField('Electorate').nullable().optional(),
    postalCode: z
      .string()
      .max(20)
      .nullable()
      .optional()
      .refine((v) => !v || POSTAL_CODE_REGEX.test(v), { message: 'Postal code must contain exactly 5 digits' }),
    dateOfBirth: notFutureDateString,
    birthPlace: z.string().min(1, 'Birth place is required').max(255),
    sex: z.enum(sexValues),
    maritalStatus: z.enum(maritalStatusValues),
    nationality: z.string().min(1, 'Nationality is required').max(100),
    religion: z.string().max(100).nullable().optional(),
    secondaryContactNumber: optionalPhoneField('Secondary contact number'),
    spouseName: z.string().max(255).nullable().optional(),
    spouseNic: optionalNicField('Spouse NIC'),
    spouseDateOfBirth: notFutureDateString.nullable().optional(),
    spouseContactNumber: optionalPhoneField('Spouse contact number'),
    spouseOccupation: z.string().max(500).nullable().optional(),
    motherName: z.string().min(1, "Mother's name is required").max(255),
    motherOccupation: z.string().max(500).nullable().optional(),
    motherContactNumber: optionalPhoneField("Mother's contact number"),
    fatherName: z.string().min(1, "Father's name is required").max(255),
    fatherOccupation: z.string().max(500).nullable().optional(),
    fatherContactNumber: optionalPhoneField("Father's contact number"),
    siblingDetails: z.string().max(2000).nullable().optional(),
    primarySchoolAttended: z.string().max(255).nullable().optional(),
    secondarySchoolAttended: z.string().max(255).nullable().optional(),
  })
  // OCD-432: spouse details become mandatory once marital status is "married".
  .superRefine((data, ctx) => {
    if (data.maritalStatus !== 'married') return;
    if (!data.spouseName?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Spouse Name is required.', path: ['spouseName'] });
    }
    if (!data.spouseNic?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Spouse NIC is required.', path: ['spouseNic'] });
    }
    if (!data.spouseContactNumber?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Spouse Contact Number is required.', path: ['spouseContactNumber'] });
    }
    if (!data.spouseDateOfBirth?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Spouse Date of Birth is required.', path: ['spouseDateOfBirth'] });
    }
  });

// Mirrors StepRemittance.tsx's residing-address/landline fields - all
// optional there, since bank details (already required on the Bank/Remittance
// step) live as top-level fields on tbl_employee, not here.
const remittanceSchema = z.object({
  residingAddressLine1: z.string().max(255).nullable().optional(),
  residingAddressLine2: z.string().max(255).nullable().optional(),
  residingCity: z.string().max(100).nullable().optional(),
  residingDistrict: z.string().max(100).nullable().optional(),
  landlineNumber: optionalPhoneField('Landline number'),
});

const welfareSchema = z.object({
  weddingAnniversaryDate: notFutureDateString.nullable().optional(),
  hobbies: z.string().max(2000).nullable().optional(),
  communityActivities: z.string().max(2000).nullable().optional(),
  professionalMemberships: z.string().max(2000).nullable().optional(),
  linkedinProfile: z
    .string()
    .max(255)
    .nullable()
    .optional()
    .refine((v) => !v || LINKEDIN_URL_REGEX.test(v), { message: 'linkedinProfile must be a valid LinkedIn profile URL' }),
  additionalNotes: z.string().max(2000).nullable().optional(),
});

const healthSchema = z.object({
  medicalConditions: z.string().max(2000).nullable().optional(),
  allergies: z.string().max(2000).nullable().optional(),
});

export const createEmployeeProfileSchema = z.object({
  statutory: statutorySchema.optional(),
  // OCD-471/OCD-472/OCD-428: at least one nominee is required (no upper
  // cap any more - the old "max 2" restriction is removed) - the individual
  // (nomineeValueSchema) and cumulative-100% proportion checks are both
  // enforced below.
  nominees: z
    .array(nomineeValueSchema)
    .min(1, 'At least one nominee must be added for EPF/ETF beneficiary allocation.')
    .optional()
    .refine((list) => !list || list.reduce((sum, n) => sum + n.proportionPercent, 0) <= 100, {
      message: 'Total nominee proportion cannot exceed 100%.',
    })
    .refine((list) => !list || list.reduce((sum, n) => sum + n.proportionPercent, 0) === 100, {
      message: 'Total nominee proportion must equal 100%.',
    }),
  remittance: remittanceSchema.optional(),
  dependents: z.array(dependentValueSchema).optional(),
  // OCD-474: at least one emergency contact is required.
  emergencyContacts: z
    .array(emergencyContactRecordValueSchema)
    .min(1, 'At least one emergency contact must be added before proceeding.')
    .optional(),
  bloodType: z.enum(bloodTypeValues).optional(),
  welfare: welfareSchema.optional(),
  health: healthSchema.optional(),
  education: z.array(educationAfterSchema).optional(),
  workHistory: z.array(workHistoryAfterSchema).optional(),
  // The "must be checked to submit" rule is enforced client-side (see
  // StepReview.tsx/CreateUserModal.tsx) - kept optional here, like every
  // other section, so this endpoint stays usable for partial profile writes.
  declarationAccepted: z.boolean().optional(),
});
export type CreateEmployeeProfileInput = z.infer<typeof createEmployeeProfileSchema>;
