import { z } from 'zod';
import { educationAfterSchema } from './employeeEducation.validator';
import { workHistoryAfterSchema } from './employeeWorkHistory.validator';

const nullableString = z.string().max(1000).nullable();

export const bankAccountValueSchema = z.object({
  bankName: z.string().max(255).nullable(),
  accountHolderName: z.string().max(255).nullable(),
  accountNumber: z.string().max(255).nullable(),
  bankBranch: z.string().max(255).nullable(),
  bankBranchCode: z.string().max(30).nullable().optional(),
  swiftCode: z.string().max(30).nullable().optional(),
});
export type BankAccountValue = z.infer<typeof bankAccountValueSchema>;

// OCD-419: mirrors LOCATION_NAME_PATTERN/ADDRESS_LINE_PATTERN in
// lib/validation/textValidation.ts (frontend) - city/district are
// letters-only "name" fields, address lines are more permissive since house/
// street numbers are expected.
const LOCATION_NAME_REGEX = /^[A-Za-zÀ-ɏ\s'.-]+$/;
const ADDRESS_LINE_REGEX = /^[A-Za-z0-9À-ɏ\s,./#-]+$/;

export const addressValueSchema = z.object({
  addressLine1: z.string().min(1, 'Address line 1 is required').max(255).regex(ADDRESS_LINE_REGEX, 'Address line 1 contains unsupported characters'),
  addressLine2: z.string().max(255).nullable().refine((v) => !v || ADDRESS_LINE_REGEX.test(v), {
    message: 'Address line 2 contains unsupported characters',
  }),
  city: z.string().min(1, 'City is required').max(100).regex(LOCATION_NAME_REGEX, 'City must contain only letters, spaces, apostrophes, periods and hyphens'),
  district: z.string().min(1, 'District is required').max(100).regex(LOCATION_NAME_REGEX, 'District must contain only letters, spaces, apostrophes, periods and hyphens'),
});
export type AddressValue = z.infer<typeof addressValueSchema>;

export const emergencyContactValueSchema = z.object({
  emergencyContactName: z.string().min(1, 'Emergency contact name is required').max(255),
  emergencyContactPhone: z.string().min(1, 'Emergency contact phone is required').max(30),
  emergencyContactRelationship: z.string().max(100).nullable(),
});
export type EmergencyContactValue = z.infer<typeof emergencyContactValueSchema>;

export const bloodTypeValues = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const;
export const sexValues = ['male', 'female'] as const;
export const maritalStatusValues = ['married', 'single'] as const;
const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// OCD-417: server-side mirror of noFutureDate in
// lib/validation/textValidation.ts (frontend) - applied only to the fields
// this batch owns (statutory DOB/spouse DOB, dependent DOB, wedding
// anniversary), not e.g. hireDate/awardedDate which belong to the Create
// Employee wizard's own basic-info/education steps.
const notFutureDateString = isoDateString.refine(
  (value) => new Date(value).getTime() <= Date.now(),
  { message: 'Date cannot be a future date. Please enter a valid date.' }
);

// OCD-416: Sri Lankan NIC - old format (9 digits + V/X) or new 12-digit format.
const nicString = (label: string) =>
  z.string().regex(/^(\d{9}[VvXx]|\d{12})$/, `${label} must be a valid Sri Lankan NIC number`);

// OCD-420: Sri Lankan mobile number - starts with 07, exactly 10 digits
// (local format), or the equivalent +947XXXXXXXX international format
// already accepted elsewhere in this codebase (see emergencyContactPhone on
// emergencyContactValueSchema above, and existing test fixtures).
const mobileNumberString = (label: string) =>
  z.string().regex(/^(07\d{8}|\+947\d{8})$/, `${label} must be a valid Sri Lankan mobile number`);

// Broader phone check (mobile or landline) for fields that may hold either,
// in either local (0XXXXXXXXX) or international (+94XXXXXXXXX) format.
const phoneNumberString = (label: string) =>
  z.string().regex(/^(0\d{9}|\+94\d{9})$/, `${label} must be a valid phone number`);

// Tab 1a - nominees (no longer capped at 2 - see OCD-472; the max-2 cap
// previously enforced in employeeProfileCreation.validator.ts is removed).
export const nomineeValueSchema = z.object({
  nameWithInitials: z.string().min(1, 'Name is required').max(255),
  nic: nicString('Nominee NIC'),
  relationship: z.string().min(1, 'Relationship is required').max(100),
  // OCD-428: an individual nominee's proportion must be > 0 and <= 100 -
  // the cumulative-100% check across all nominees happens where the full
  // array is available (createEmployeeProfileSchema/profileChangeItemSchema).
  proportionPercent: z.coerce.number().gt(0, 'Proportion must be greater than 0').max(100, 'Nominee proportion cannot exceed 100%'),
});
export type NomineeValue = z.infer<typeof nomineeValueSchema>;

// Tab C - medical/welfare dependents (only meaningful while marital_status is 'married')
export const dependentValueSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(255),
  // Not applicable for children under 16 years of age.
  nic: z.string().max(20).nullable().optional().refine((v) => !v || nicString('NIC').safeParse(v).success, {
    message: 'NIC must be a valid Sri Lankan NIC number',
  }),
  dateOfBirth: notFutureDateString,
  gender: z.enum(sexValues),
  relationship: z.enum(['spouse', 'child']),
  mobileNumber: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .refine((v) => !v || mobileNumberString('Mobile number').safeParse(v).success, {
      message: 'Mobile number must start with 07 and contain 10 digits',
    }),
  // Only meaningful for relationship = 'child'.
  school: z.string().max(255).nullable().optional(),
});
export type DependentValue = z.infer<typeof dependentValueSchema>;

// Tab D - emergency contacts (multi-record)
export const emergencyContactRecordValueSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  relationship: z.string().min(1, 'Relationship is required').max(100),
  contactNumber: phoneNumberString('Contact number'),
});
export type EmergencyContactRecordValue = z.infer<typeof emergencyContactRecordValueSchema>;

// Bundle item shapes. Kept as plain ZodObjects (no .refine/.superRefine on the
// individual branches) so they remain valid discriminatedUnion members; the
// cross-field checks that depend on `field`/`operation` are applied once via
// .superRefine on the assembled union below.
const userFieldChangeBase = z.object({
  entityType: z.literal('user_field'),
  field: z.enum([
    'title',
    'contactNumber',
    'undergraduateDegreeCompletionDate',
    'bank_account',
    // Non-PII personal/statutory attributes - live on tbl_employee, not
    // tbl_employee_pii, so they travel as user_field changes even though
    // they were previously part of the employee_pii_field union below.
    'dateOfBirth',
    'sex',
    'maritalStatus',
    'nationality',
    'religion',
    'spouseDateOfBirth',
    'siblingDetails',
    'gramaNiladariDivision',
    'electorate',
    'postalCode',
    'linkedinProfile',
    // OCD-456: Education step (primary/secondary school attended), now
    // editable via the self-service profile wizard - maps directly to
    // tbl_employee.primary_school / secondary_school (see employee.schema.ts).
    'primarySchool',
    'secondarySchool',
  ]),
  operation: z.literal('update'),
  before: z.union([nullableString, bankAccountValueSchema]),
  after: z.union([nullableString, bankAccountValueSchema]),
});

// Note: 'emergency_contact' was removed here in favor of the multi-record
// 'emergency_contact_record' entity type below (tbl_employee_pii can only
// hold one contact; Tab D needs several). Any request still pending under
// the old shape must be resolved before this validator ships.
const piiFieldChangeBase = z.object({
  entityType: z.literal('employee_pii_field'),
  field: z.enum([
    'address',
    'residing_address',
    'blood_type',
    'full_name_as_nic',
    'name_with_initials',
    'calling_name',
    'birth_place',
    'spouse_name',
    'spouse_nic',
    'spouse_contact_number',
    'spouse_occupation',
    'mother_name',
    'mother_occupation',
    'mother_contact_number',
    'father_name',
    'father_occupation',
    'father_contact_number',
    'landline_number',
    'secondary_contact_number',
    'medical_conditions',
    'allergies',
    'additional_notes',
    'national_id',
  ]),
  operation: z.literal('update'),
  before: z.union([addressValueSchema, z.enum(bloodTypeValues), nullableString]),
  after: z.union([addressValueSchema, z.enum(bloodTypeValues), nullableString]),
});

const educationChangeBase = z.object({
  entityType: z.literal('education'),
  operation: z.enum(['create', 'update', 'delete']),
  recordId: z.number().int().positive().nullable(),
  before: educationAfterSchema.nullable().optional(),
  after: educationAfterSchema.nullable().optional(),
});

const workHistoryChangeBase = z.object({
  entityType: z.literal('work_history'),
  operation: z.enum(['create', 'update', 'delete']),
  recordId: z.number().int().positive().nullable(),
  before: workHistoryAfterSchema.nullable().optional(),
  after: workHistoryAfterSchema.nullable().optional(),
});

const nomineeChangeBase = z.object({
  entityType: z.literal('nominee'),
  operation: z.enum(['create', 'update', 'delete']),
  recordId: z.number().int().positive().nullable(),
  before: nomineeValueSchema.nullable().optional(),
  after: nomineeValueSchema.nullable().optional(),
});

const dependentChangeBase = z.object({
  entityType: z.literal('dependent'),
  operation: z.enum(['create', 'update', 'delete']),
  recordId: z.number().int().positive().nullable(),
  before: dependentValueSchema.nullable().optional(),
  after: dependentValueSchema.nullable().optional(),
});

const emergencyContactRecordChangeBase = z.object({
  entityType: z.literal('emergency_contact_record'),
  operation: z.enum(['create', 'update', 'delete']),
  recordId: z.number().int().positive().nullable(),
  before: emergencyContactRecordValueSchema.nullable().optional(),
  after: emergencyContactRecordValueSchema.nullable().optional(),
});

const welfareFieldChangeBase = z.object({
  entityType: z.literal('welfare_field'),
  field: z.enum(['anniversary_date', 'hobbies', 'community_activities', 'professional_memberships']),
  operation: z.literal('update'),
  before: nullableString,
  after: nullableString,
});

type RefineCtx = z.RefinementCtx;

function checkUserFieldChange(data: z.infer<typeof userFieldChangeBase>, ctx: RefineCtx) {
  if (data.field === 'bank_account') {
    if (!bankAccountValueSchema.safeParse(data.before).success) {
      ctx.addIssue({ code: 'custom', message: 'before must be a bank account object', path: ['before'] });
    }
    if (!bankAccountValueSchema.safeParse(data.after).success) {
      ctx.addIssue({ code: 'custom', message: 'after must be a bank account object', path: ['after'] });
    }
    return;
  }
  if (data.field === 'sex') {
    checkEnumChange(data, ctx, sexValues);
    return;
  }
  if (data.field === 'maritalStatus') {
    checkEnumChange(data, ctx, maritalStatusValues);
    return;
  }
  if (typeof data.before !== 'string' && data.before !== null) {
    ctx.addIssue({ code: 'custom', message: 'before must be a string or null', path: ['before'] });
  }
  if (typeof data.after !== 'string' && data.after !== null) {
    ctx.addIssue({ code: 'custom', message: 'after must be a string or null', path: ['after'] });
  }
  if (data.field === 'dateOfBirth' || data.field === 'spouseDateOfBirth') {
    if (typeof data.before === 'string' && !isoDateString.safeParse(data.before).success) {
      ctx.addIssue({ code: 'custom', message: 'before must be in YYYY-MM-DD format', path: ['before'] });
    }
    if (typeof data.after === 'string' && !notFutureDateString.safeParse(data.after).success) {
      ctx.addIssue({ code: 'custom', message: 'after must be a valid, non-future YYYY-MM-DD date', path: ['after'] });
    }
    return;
  }
  // OCD-419/OCD-427/OCD-433: format checks for the remaining user_field
  // entries this batch owns. Only applied to `after` (the new value being
  // submitted) - `before` is whatever was already stored, which may predate
  // these rules.
  if (typeof data.after !== 'string' || !data.after) return;
  if ((data.field === 'gramaNiladariDivision' || data.field === 'electorate') && !LOCATION_NAME_REGEX.test(data.after)) {
    ctx.addIssue({
      code: 'custom',
      message: `${data.field} must contain only letters, spaces, apostrophes, periods and hyphens`,
      path: ['after'],
    });
  }
  if (data.field === 'postalCode' && !/^\d{5}$/.test(data.after)) {
    ctx.addIssue({ code: 'custom', message: 'Postal code must contain exactly 5 digits', path: ['after'] });
  }
  if (data.field === 'linkedinProfile' && !/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Z0-9\-_%]+\/?$/i.test(data.after)) {
    ctx.addIssue({ code: 'custom', message: 'linkedinProfile must be a valid LinkedIn profile URL', path: ['after'] });
  }
}

function checkAddressLikePiiChange(
  data: z.infer<typeof piiFieldChangeBase>,
  ctx: RefineCtx,
  afterRequired: boolean
) {
  if (data.before !== null && !addressValueSchema.safeParse(data.before).success) {
    ctx.addIssue({ code: 'custom', message: 'before must be an address object or null', path: ['before'] });
  }
  if (afterRequired) {
    if (!addressValueSchema.safeParse(data.after).success) {
      ctx.addIssue({ code: 'custom', message: 'after must be an address object', path: ['after'] });
    }
  } else if (data.after !== null && !addressValueSchema.safeParse(data.after).success) {
    ctx.addIssue({ code: 'custom', message: 'after must be an address object or null', path: ['after'] });
  }
}

function checkEnumChange(data: { before: unknown; after: unknown }, ctx: RefineCtx, values: readonly string[]) {
  if (data.before !== null && !values.includes(data.before as string)) {
    ctx.addIssue({ code: 'custom', message: 'before must be a valid value or null', path: ['before'] });
  }
  if (!values.includes(data.after as string)) {
    ctx.addIssue({ code: 'custom', message: 'after must be a valid value', path: ['after'] });
  }
}

const NIC_PII_FIELDS = ['national_id', 'spouse_nic'] as const;
const PHONE_PII_FIELDS = [
  'spouse_contact_number',
  'mother_contact_number',
  'father_contact_number',
  'landline_number',
  'secondary_contact_number',
] as const;

function checkScalarPiiChange(data: z.infer<typeof piiFieldChangeBase>, ctx: RefineCtx) {
  if (typeof data.before !== 'string' && data.before !== null) {
    ctx.addIssue({ code: 'custom', message: 'before must be a string or null', path: ['before'] });
  }
  if (typeof data.after !== 'string' && data.after !== null) {
    ctx.addIssue({ code: 'custom', message: 'after must be a string or null', path: ['after'] });
  }
  if (typeof data.after !== 'string' || !data.after) return;
  // OCD-416/OCD-420/OCD-444: format checks for the NIC/phone-shaped PII
  // fields this batch owns - only applied to `after`, same reasoning as
  // checkUserFieldChange above.
  if ((NIC_PII_FIELDS as readonly string[]).includes(data.field) && !/^(\d{9}[VvXx]|\d{12})$/.test(data.after)) {
    ctx.addIssue({ code: 'custom', message: `${data.field} must be a valid Sri Lankan NIC number`, path: ['after'] });
  }
  if ((PHONE_PII_FIELDS as readonly string[]).includes(data.field) && !/^(0\d{9}|\+94\d{9})$/.test(data.after)) {
    ctx.addIssue({ code: 'custom', message: `${data.field} must be a valid phone number`, path: ['after'] });
  }
}

function checkPiiFieldChange(data: z.infer<typeof piiFieldChangeBase>, ctx: RefineCtx) {
  if (data.field === 'address') {
    checkAddressLikePiiChange(data, ctx, true);
  } else if (data.field === 'residing_address') {
    // Optional - "if different from the permanent address" - after may be
    // null to mean "same as permanent".
    checkAddressLikePiiChange(data, ctx, false);
  } else if (data.field === 'blood_type') {
    checkEnumChange(data, ctx, bloodTypeValues);
  } else {
    checkScalarPiiChange(data, ctx);
  }
}

// OCD-417: anniversary_date is the one welfare_field with a shape rule
// (must not be a future date) - hobbies/community_activities/professional_memberships
// are free text with no server-side format rule beyond the generic
// string-or-null check the discriminated-union base already applies.
function checkWelfareFieldChange(data: z.infer<typeof welfareFieldChangeBase>, ctx: RefineCtx) {
  if (data.field === 'anniversary_date' && typeof data.after === 'string' && data.after) {
    if (!notFutureDateString.safeParse(data.after).success) {
      ctx.addIssue({ code: 'custom', message: 'after must be a valid, non-future YYYY-MM-DD date', path: ['after'] });
    }
  }
}

function checkRecordChange(
  data: { operation: 'create' | 'update' | 'delete'; recordId: number | null; before?: unknown; after?: unknown },
  ctx: RefineCtx
) {
  if (data.operation === 'create') {
    if (data.recordId !== null) {
      ctx.addIssue({ code: 'custom', message: 'create requires a null recordId', path: ['recordId'] });
    }
    if (!data.after) {
      ctx.addIssue({ code: 'custom', message: 'create requires an after value', path: ['after'] });
    }
    return;
  }
  if (data.recordId === null || data.recordId === undefined) {
    ctx.addIssue({ code: 'custom', message: 'update/delete requires a recordId', path: ['recordId'] });
  }
  if (!data.before) {
    ctx.addIssue({ code: 'custom', message: 'update/delete requires a before value', path: ['before'] });
  }
  if (data.operation === 'update' && !data.after) {
    ctx.addIssue({ code: 'custom', message: 'update requires an after value', path: ['after'] });
  }
}

export const profileChangeItemSchema = z
  .discriminatedUnion('entityType', [
    userFieldChangeBase,
    piiFieldChangeBase,
    educationChangeBase,
    workHistoryChangeBase,
    nomineeChangeBase,
    dependentChangeBase,
    emergencyContactRecordChangeBase,
    welfareFieldChangeBase,
  ])
  .superRefine((data, ctx) => {
    if (data.entityType === 'user_field') {
      checkUserFieldChange(data, ctx);
    } else if (data.entityType === 'employee_pii_field') {
      checkPiiFieldChange(data, ctx);
    } else if (data.entityType === 'welfare_field') {
      checkWelfareFieldChange(data, ctx);
    } else if (
      data.entityType === 'education' ||
      data.entityType === 'work_history' ||
      data.entityType === 'nominee' ||
      data.entityType === 'dependent' ||
      data.entityType === 'emergency_contact_record'
    ) {
      checkRecordChange(data, ctx);
    }
  });
export type ProfileChangeItem = z.infer<typeof profileChangeItemSchema>;

// OCD-478: accepts either a real array (plain JSON submission, no
// documents) or a JSON-encoded string (multipart/form-data, required once
// supporting documents are attached) - same shape as document.validator.ts's
// idArrayField.
const changesField = z
  .union([z.array(z.unknown()), z.string()])
  .transform((v) => (typeof v === 'string' ? JSON.parse(v) : v))
  .pipe(z.array(profileChangeItemSchema).min(1, 'At least one change is required'));

export const submitProfileChangeRequestSchema = z.object({
  changes: changesField,
  // OCD-478: optional "Reason for Change" free-text field surfaced on the
  // final step of the self-service Edit Profile wizard.
  comments: z.string().max(2000).optional(),
  previousRequestId: z.coerce.number().int().positive().optional(),
});
export type SubmitProfileChangeRequestInput = z.infer<typeof submitProfileChangeRequestSchema>;

export const decideProfileChangeRequestSchema = z
  .object({
    decision: z.enum(['approved', 'rejected', 'returned_for_modification']),
    reviewerComments: z.string().max(2000).optional(),
  })
  .refine(d => d.decision === 'approved' || !!d.reviewerComments?.trim(), {
    message: 'reviewerComments is required when rejecting or returning a request',
    path: ['reviewerComments'],
  });
export type DecideProfileChangeRequestInput = z.infer<typeof decideProfileChangeRequestSchema>;

export const listProfileChangeRequestsQuerySchema = z.object({
  status: z
    .enum(['pending_approval', 'approved', 'rejected', 'returned_for_modification', 'cancelled'])
    .optional(),
  userId: z.coerce.number().int().positive().optional(),
});
export type ListProfileChangeRequestsQuery = z.infer<typeof listProfileChangeRequestsQuerySchema>;

export const profileChangeRequestIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type ProfileChangeRequestIdParam = z.infer<typeof profileChangeRequestIdParamSchema>;
