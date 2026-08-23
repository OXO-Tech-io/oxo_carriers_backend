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

// Mirrors StepStatutory.tsx's required fields exactly - filled in by HR at
// employee-creation time instead of via the employee's own change-request wizard.
const statutorySchema = z.object({
  nationalId: z.string().min(1, 'NIC number is required').max(20),
  legalName: z.string().min(1, 'Full name is required').max(255),
  initialsName: z.string().min(1, 'Name with initials is required').max(255),
  callingName: z.string().max(255).nullable().optional(),
  addressLine1: z.string().min(1, 'Address line 1 is required').max(255),
  addressLine2: z.string().max(255).nullable().optional(),
  city: z.string().min(1, 'City is required').max(100),
  district: z.string().min(1, 'District is required').max(100),
  gramaNiladariDivision: z.string().max(150).nullable().optional(),
  electorate: z.string().max(150).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  dateOfBirth: isoDateString,
  birthPlace: z.string().min(1, 'Birth place is required').max(255),
  sex: z.enum(sexValues),
  maritalStatus: z.enum(maritalStatusValues),
  nationality: z.string().min(1, 'Nationality is required').max(100),
  religion: z.string().max(100).nullable().optional(),
  secondaryContactNumber: z.string().max(30).nullable().optional(),
  spouseName: z.string().max(255).nullable().optional(),
  spouseNic: z.string().max(20).nullable().optional(),
  spouseDateOfBirth: isoDateString.nullable().optional(),
  spouseContactNumber: z.string().max(30).nullable().optional(),
  spouseOccupation: z.string().max(500).nullable().optional(),
  motherName: z.string().min(1, "Mother's name is required").max(255),
  motherOccupation: z.string().max(500).nullable().optional(),
  motherContactNumber: z.string().max(30).nullable().optional(),
  fatherName: z.string().min(1, "Father's name is required").max(255),
  fatherOccupation: z.string().max(500).nullable().optional(),
  fatherContactNumber: z.string().max(30).nullable().optional(),
  siblingDetails: z.string().max(2000).nullable().optional(),
  primarySchoolAttended: z.string().max(255).nullable().optional(),
  secondarySchoolAttended: z.string().max(255).nullable().optional(),
});

// Mirrors StepRemittance.tsx's residing-address/landline fields - all
// optional there, since bank details (already required on the Bank/Remittance
// step) live as top-level fields on tbl_employee, not here.
const remittanceSchema = z.object({
  residingAddressLine1: z.string().max(255).nullable().optional(),
  residingAddressLine2: z.string().max(255).nullable().optional(),
  residingCity: z.string().max(100).nullable().optional(),
  residingDistrict: z.string().max(100).nullable().optional(),
  landlineNumber: z.string().max(30).nullable().optional(),
});

const welfareSchema = z.object({
  weddingAnniversaryDate: isoDateString.nullable().optional(),
  hobbies: z.string().max(2000).nullable().optional(),
  communityActivities: z.string().max(2000).nullable().optional(),
  professionalMemberships: z.string().max(2000).nullable().optional(),
  linkedinProfile: z.string().max(255).nullable().optional(),
  additionalNotes: z.string().max(2000).nullable().optional(),
});

const healthSchema = z.object({
  medicalConditions: z.string().max(2000).nullable().optional(),
  allergies: z.string().max(2000).nullable().optional(),
});

export const createEmployeeProfileSchema = z.object({
  statutory: statutorySchema.optional(),
  nominees: z.array(nomineeValueSchema).max(2, 'An employee can have at most 2 nominees').optional(),
  remittance: remittanceSchema.optional(),
  dependents: z.array(dependentValueSchema).optional(),
  emergencyContacts: z.array(emergencyContactRecordValueSchema).optional(),
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
