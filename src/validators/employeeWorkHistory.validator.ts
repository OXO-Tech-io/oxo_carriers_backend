import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// Reusable "after" (proposed record) shape - imported by profileChangeRequest.validator.ts
// so field validation for work history records isn't duplicated across modules.
export const workHistoryAfterSchema = z
  .object({
    organization: z.string().min(1, 'Organization is required').max(255),
    positionHeld: z.string().min(1, 'Position held is required').max(255),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(), // null/omitted = "Present"
    remarks: z.string().max(2000).nullable().optional(),
  })
  .refine(data => !data.endDate || data.endDate >= data.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });
export type WorkHistoryAfterInput = z.infer<typeof workHistoryAfterSchema>;

export const listWorkHistoryQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
});
export type ListWorkHistoryQuery = z.infer<typeof listWorkHistoryQuerySchema>;
