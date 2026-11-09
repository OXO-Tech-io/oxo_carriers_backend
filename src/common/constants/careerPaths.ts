// "Related Career Path" options shown next to Designation on the Create
// Employee form / employee profile. Stored on tbl_employee.career_path as the
// value below; the frontend maps each value to its display label.
export const CAREER_PATHS = [
  'pm',
  'ba',
  'ui_ux',
  'qa',
  'software_development',
  'sales',
  'finance',
  'marketing',
  'hr',
  'other',
] as const;

export type CareerPath = (typeof CAREER_PATHS)[number];
