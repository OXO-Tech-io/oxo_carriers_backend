/** Lower-cased tbl_leave_types names treated as annual leave. */
export const ANNUAL_LEAVE_TYPE_NAMES: readonly string[] = ['annual', 'annual/paid leave', 'annual leave'];

/** Lower-cased tbl_leave_types names treated as casual leave. */
export const CASUAL_LEAVE_TYPE_NAMES: readonly string[] = ['casual', 'casual leave'];

export function isAnnualLeaveType(name: string): boolean {
  return ANNUAL_LEAVE_TYPE_NAMES.includes(name.toLowerCase());
}

export function isCasualLeaveType(name: string): boolean {
  return CASUAL_LEAVE_TYPE_NAMES.includes(name.toLowerCase());
}
