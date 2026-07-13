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
export const educationAfterSchema = z.object({
  qualificationLevel: z.enum(qualificationLevelValues),
  qualificationTitle: z.string().min(1, 'Qualification title is required').max(255),
  awardingInstitution: z.string().min(1, 'Awarding institution is required').max(255),
  dateAwarded: isoDate.nullable().optional(),
  remarks: z.string().max(2000).nullable().optional(),
});
export type EducationAfterInput = z.infer<typeof educationAfterSchema>;

export const listEducationQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
});
export type ListEducationQuery = z.infer<typeof listEducationQuerySchema>;
