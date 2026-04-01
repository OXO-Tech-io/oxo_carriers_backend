/**
 * Calculate annual leave entitlement based on hire date
 * 
 * FIRST YEAR (year of joining):
 * - 0.5 days per month for remaining months in the year
 * - Example: Join on 10 Jan 2026 → 0.5 * 12 months = 6 days for 2026
 * - Example: Join on 15 Jul 2026 → 0.5 * 6 months = 3 days for 2026
 * 
 * SECOND YEAR ONWARDS (after completing one full year):
 * - Jan 1 – Mar 31 hire date: 14 days per year
 * - Apr 1 – Jun 30 hire date: 10 days per year
 * - Jul 1 – Sep 30 hire date: 7 days per year
 * - Oct 1 – Dec 31 hire date: 4 days per year
 */
export function calculateProRatedAnnualLeave(hireDate: Date, year: number): number {
  const hireYear = hireDate.getFullYear();
  
  // FIRST YEAR: 0.5 days per remaining month
  if (hireYear === year) {
    const hireMonth = hireDate.getMonth(); // 0-11
    const remainingMonths = 12 - hireMonth; // Number of months from hire month to end of year
    return Math.round(remainingMonths * 0.5 * 10) / 10; // 0.5 days per month, rounded to 1 decimal
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
 * Check if a user is in their first year of employment
 */
export function isFirstYear(hireDate: Date, year: number): boolean {
  return hireDate.getFullYear() === year;
}
