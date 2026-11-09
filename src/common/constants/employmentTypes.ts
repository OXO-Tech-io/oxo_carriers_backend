// Work-history "Employment Type" values (levels). 'regular' is the legacy value
// from before the level-based list: still valid on existing rows and as the
// column default, but the frontend no longer offers it for new entries.
export const EMPLOYMENT_TYPES = [
  'regular',
  'intern',
  'trainee',
  'apprentice',
  'entry_level',
  'mid_level',
  'senior',
  'staff_principal_lead',
  'mid_management',
  'executive',
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
