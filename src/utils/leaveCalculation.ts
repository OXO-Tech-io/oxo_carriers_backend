/**
 * Calculate pro-rated annual leave entitlement based on hire date for the first year
 * Jan 1 – Mar 31: 14 days (full entitlement)
 * Apr 1 – Jun 30: 10 days
 * Jul 1 – Sep 30: 7 days
 * Oct 1 – Dec 31: 4 days
 */
export function calculateProRatedAnnualLeave(hireDate: Date, year: number): number {
  const hireYear = hireDate.getFullYear();
  
  // If not the first year, return full entitlement
  if (hireYear !== year) {
    return 14; // Full annual leave entitlement
  }

  const month = hireDate.getMonth() + 1; // getMonth() returns 0-11, so add 1

  if (month >= 1 && month <= 3) {
    // Jan 1 – Mar 31: 14 days (full entitlement)
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
 * Check if a user is in their first year of employment
 */
export function isFirstYear(hireDate: Date, year: number): boolean {
  return hireDate.getFullYear() === year;
}
