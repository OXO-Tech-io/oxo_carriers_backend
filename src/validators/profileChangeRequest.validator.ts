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

export const addressValueSchema = z.object({
  addressLine1: z.string().min(1, 'Address line 1 is required').max(255),
  addressLine2: z.string().max(255).nullable(),
  city: z.string().min(1, 'City is required').max(100),
  district: z.string().min(1, 'District is required').max(100),
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

// Tab 1a - nominees (max 2 per employee, capped in the service layer)
export const nomineeValueSchema = z.object({
  nameWithInitials: z.string().min(1, 'Name is required').max(255),
  nic: z.string().min(1, 'NIC is required').max(20),
  relationship: z.string().min(1, 'Relationship is required').max(100),
  proportionPercent: z.coerce.number().min(0).max(100),
});
export type NomineeValue = z.infer<typeof nomineeValueSchema>;

// Tab C - medical/welfare dependents (only meaningful while marital_status is 'married')
export const dependentValueSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(255),
  // Not applicable for children under 16 years of age.
  nic: z.string().max(20).nullable().optional(),
  dateOfBirth: isoDateString,
  gender: z.enum(sexValues),
  relationship: z.enum(['spouse', 'child']),
  mobileNumber: z.string().max(30).nullable().optional(),
});
export type DependentValue = z.infer<typeof dependentValueSchema>;

// Tab D - emergency contacts (multi-record)
export const emergencyContactRecordValueSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  relationship: z.string().min(1, 'Relationship is required').max(100),
  contactNumber: z.string().min(1, 'Contact number is required').max(30),
});
export type EmergencyContactRecordValue = z.infer<typeof emergencyContactRecordValueSchema>;

// Bundle item shapes. Kept as plain ZodObjects (no .refine/.superRefine on the
// individual branches) so they remain valid discriminatedUnion members; the
// cross-field checks that depend on `field`/`operation` are applied once via
// .superRefine on the assembled union below.
const userFieldChangeBase = z.object({
  entityType: z.literal('user_field'),
  field: z.enum(['title', 'contactNumber', 'undergraduateDegreeCompletionDate', 'bank_account']),
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
    'date_of_birth',
    'birth_place',
    'sex',
    'marital_status',
    'nationality',
    'spouse_name',
    'mother_name',
    'father_name',
    'landline_number',
    'national_id',
  ]),
  operation: z.literal('update'),
  before: z.union([addressValueSchema, z.enum(bloodTypeValues), z.enum(sexValues), z.enum(maritalStatusValues), nullableString]),
  after: z.union([addressValueSchema, z.enum(bloodTypeValues), z.enum(sexValues), z.enum(maritalStatusValues), nullableString]),
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
  if (typeof data.before !== 'string' && data.before !== null) {
    ctx.addIssue({ code: 'custom', message: 'before must be a string or null', path: ['before'] });
  }
  if (typeof data.after !== 'string' && data.after !== null) {
    ctx.addIssue({ code: 'custom', message: 'after must be a string or null', path: ['after'] });
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

function checkEnumPiiChange(data: z.infer<typeof piiFieldChangeBase>, ctx: RefineCtx, values: readonly string[]) {
  if (data.before !== null && !values.includes(data.before as string)) {
    ctx.addIssue({ code: 'custom', message: 'before must be a valid value or null', path: ['before'] });
  }
  if (!values.includes(data.after as string)) {
    ctx.addIssue({ code: 'custom', message: 'after must be a valid value', path: ['after'] });
  }
}

function checkScalarPiiChange(data: z.infer<typeof piiFieldChangeBase>, ctx: RefineCtx) {
  if (typeof data.before !== 'string' && data.before !== null) {
    ctx.addIssue({ code: 'custom', message: 'before must be a string or null', path: ['before'] });
  }
  if (typeof data.after !== 'string' && data.after !== null) {
    ctx.addIssue({ code: 'custom', message: 'after must be a string or null', path: ['after'] });
  }
  if (data.field === 'date_of_birth') {
    if (typeof data.before === 'string' && !isoDateString.safeParse(data.before).success) {
      ctx.addIssue({ code: 'custom', message: 'before must be in YYYY-MM-DD format', path: ['before'] });
    }
    if (typeof data.after === 'string' && !isoDateString.safeParse(data.after).success) {
      ctx.addIssue({ code: 'custom', message: 'after must be in YYYY-MM-DD format', path: ['after'] });
    }
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
    checkEnumPiiChange(data, ctx, bloodTypeValues);
  } else if (data.field === 'sex') {
    checkEnumPiiChange(data, ctx, sexValues);
  } else if (data.field === 'marital_status') {
    checkEnumPiiChange(data, ctx, maritalStatusValues);
  } else {
    checkScalarPiiChange(data, ctx);
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

export const submitProfileChangeRequestSchema = z.object({
  changes: z.array(profileChangeItemSchema).min(1, 'At least one change is required'),
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
