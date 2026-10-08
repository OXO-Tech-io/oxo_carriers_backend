import { z } from 'zod';

export const qualificationLevelValues = [
  'certificate',
  'advanced_certificate',
  'diploma',
  'advanced_diploma',
  'degree',
  'postgraduate_diploma',
  'masters',
  'mphil',
  'phd',
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// Reusable "after" (proposed record) shape - imported by profileChangeRequest.validator.ts
// so field validation for education records isn't duplicated across modules.
export const educationAfterSchema = z
  .object({
    qualificationLevel: z.enum(qualificationLevelValues),
    qualificationTitle: z.string().min(1, 'Qualification title is required').max(255),
    awardingInstitution: z.string().min(1, 'Awarding institution is required').max(255),
    dateAwarded: isoDate.nullable().optional(),
    isOngoing: z.boolean().optional().default(false),
    remarks: z.string().max(2000).nullable().optional(),
  })
  .refine(data => data.isOngoing || !!data.dateAwarded, {
    message: 'Date awarded is required unless this qualification is currently being followed',
    path: ['dateAwarded'],
  });
export type EducationAfterInput = z.infer<typeof educationAfterSchema>;

export const employeeIdParamSchema = z.object({
  employeeId: z.string().min(1),
});
export type EmployeeIdParam = z.infer<typeof employeeIdParamSchema>;
