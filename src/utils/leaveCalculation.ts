/**
 * Calculate annual leave entitlement based on hire date
 *
 * JOINED YEAR (year of hire):
 * - No Annual Leave entitlement during the year the employee joined - 0 days.
 *
 * SECOND YEAR ONWARDS (after completing one full year):
 * - Jan 1 – Mar 31 hire date: 14 days per year
 * - Apr 1 – Jun 30 hire date: 10 days per year
 * - Jul 1 – Sep 30 hire date: 7 days per year
 * - Oct 1 – Dec 31 hire date: 4 days per year
 */
export function calculateProRatedAnnualLeave(hireDate: Date, year: number): number {
  const hireYear = hireDate.getFullYear();

  // JOINED YEAR: no Annual Leave entitlement yet
  if (hireYear === year) {
    return 0;
  }

  // SECOND YEAR ONWARDS: Quarter-based calculation
  const month = hireDate.getMonth() + 1; // getMonth() returns 0-11, so add 1

  if (month >= 1 && month <= 3) {
    // Jan 1 – Mar 31: 14 days
    return 14;
  } else if (month >= 4 && month <= 6) {
    // Apr 1 – Jun 30: 10 days
    return 10;
  } else if (month >= 7 && month <= 9) {
    // Jul 1 – Sep 30: 7 days
    return 7;
  } else {
    // Oct 1 – Dec 31: 4 days
    return 4;
  }
}

/**
 * Calculate accrued Casual Leave entitlement based on hire date.
 *
 * Casual Leave accrues at 0.5 days per completed month of service, capped at
 * the leave type's standard annual entitlement (`maxDays`) once that many
 * months have completed. This naturally pro-rates the joined year (fewer
 * completed months = fewer accrued days) without needing a separate rule for
 * later years, since a tenured employee will always have completed enough
 * months to be capped at `maxDays`.
 */
export function calculateAccruedCasualLeave(
  hireDate: Date,
  year: number,
  maxDays: number,
  asOf: Date = new Date()
): number {
  const hireYear = hireDate.getFullYear();
  if (hireYear > year) return 0;

  // Completed months are measured up to "now" when `year` is the current
  // year, or up to the end of that year for past years.
  let cutoff: Date;
  if (year === asOf.getFullYear()) {
    cutoff = asOf;
  } else if (year < asOf.getFullYear()) {
    cutoff = new Date(year, 11, 31);
  } else {
    cutoff = new Date(year, 0, 1);
  }

  let completedMonths =
    (cutoff.getFullYear() - hireDate.getFullYear()) * 12 +
    (cutoff.getMonth() - hireDate.getMonth());
  if (cutoff.getDate() < hireDate.getDate()) {
    completedMonths -= 1;
  }
  completedMonths = Math.max(0, completedMonths);

  const accrued = Math.round(completedMonths * 0.5 * 10) / 10;
  return Math.min(accrued, maxDays);
}

/**
 * Check if a user is in their first year of employment
 */
export function isFirstYear(hireDate: Date, year: number): boolean {
  return hireDate.getFullYear() === year;
}
