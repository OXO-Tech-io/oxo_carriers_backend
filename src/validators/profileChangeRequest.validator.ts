import { z } from 'zod';
import { educationAfterSchema } from './employeeEducation.validator';
import { workHistoryAfterSchema } from './employeeWorkHistory.validator';

const nullableString = z.string().max(1000).nullable();

export const bankAccountValueSchema = z.object({
  bankName: z.string().max(255).nullable(),
  accountHolderName: z.string().max(255).nullable(),
  accountNumber: z.string().max(255).nullable(),
  bankBranch: z.string().max(255).nullable(),
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

const piiFieldChangeBase = z.object({
  entityType: z.literal('employee_pii_field'),
  field: z.enum(['address', 'emergency_contact', 'blood_type']),
  operation: z.literal('update'),
  before: z.union([addressValueSchema, emergencyContactValueSchema, z.enum(bloodTypeValues), nullableString]),
  after: z.union([addressValueSchema, emergencyContactValueSchema, z.enum(bloodTypeValues)]),
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

function checkPiiFieldChange(data: z.infer<typeof piiFieldChangeBase>, ctx: RefineCtx) {
  if (data.field === 'address') {
    if (data.before !== null && !addressValueSchema.safeParse(data.before).success) {
      ctx.addIssue({ code: 'custom', message: 'before must be an address object or null', path: ['before'] });
    }
    if (!addressValueSchema.safeParse(data.after).success) {
      ctx.addIssue({ code: 'custom', message: 'after must be an address object', path: ['after'] });
    }
  } else if (data.field === 'emergency_contact') {
    if (data.before !== null && !emergencyContactValueSchema.safeParse(data.before).success) {
      ctx.addIssue({ code: 'custom', message: 'before must be an emergency contact object or null', path: ['before'] });
    }
    if (!emergencyContactValueSchema.safeParse(data.after).success) {
      ctx.addIssue({ code: 'custom', message: 'after must be an emergency contact object', path: ['after'] });
    }
  } else {
    if (data.before !== null && !bloodTypeValues.includes(data.before as any)) {
      ctx.addIssue({ code: 'custom', message: 'before must be a valid blood type or null', path: ['before'] });
    }
    if (!bloodTypeValues.includes(data.after as any)) {
      ctx.addIssue({ code: 'custom', message: 'after must be a valid blood type', path: ['after'] });
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
  ])
  .superRefine((data, ctx) => {
    if (data.entityType === 'user_field') {
      checkUserFieldChange(data, ctx);
    } else if (data.entityType === 'employee_pii_field') {
      checkPiiFieldChange(data, ctx);
    } else if (data.entityType === 'education' || data.entityType === 'work_history') {
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
