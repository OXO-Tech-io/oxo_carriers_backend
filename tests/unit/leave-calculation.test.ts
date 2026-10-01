import { describe, it, expect } from "vitest";
import {
  calculateProRatedAnnualLeave,
  calculateAccruedCasualLeave,
  calculateCasualLeaveEntitlement,
  isFirstYear,
} from "../../src/utils/leaveCalculation";

describe("leaveCalculation utils", () => {
  it("gives 0 Annual Leave for the year the employee joined", () => {
    expect(calculateProRatedAnnualLeave(new Date("2026-01-10"), 2026)).toBe(0);
    expect(calculateProRatedAnnualLeave(new Date("2026-09-10"), 2026)).toBe(0);
  });

  it("calculates later years by hire quarter", () => {
    expect(calculateProRatedAnnualLeave(new Date("2025-01-10"), 2026)).toBe(14);
    expect(calculateProRatedAnnualLeave(new Date("2025-04-10"), 2026)).toBe(10);
    expect(calculateProRatedAnnualLeave(new Date("2025-07-10"), 2026)).toBe(7);
    expect(calculateProRatedAnnualLeave(new Date("2025-10-10"), 2026)).toBe(4);
  });

  it("checks first year correctly", () => {
    expect(isFirstYear(new Date("2026-01-01"), 2026)).toBe(true);
    expect(isFirstYear(new Date("2025-01-01"), 2026)).toBe(false);
  });

  describe("entitlement for an employee joining 30 Sep 2026", () => {
    const hireDate = new Date("2026-09-30");
    it("1st year: annual 0, casual 1.5", () => {
      expect(calculateProRatedAnnualLeave(hireDate, 2026)).toBe(0);
      expect(calculateCasualLeaveEntitlement(hireDate, 2026, 7)).toBe(1.5);
    });
    it("2nd year: annual 7, casual 7", () => {
      expect(calculateProRatedAnnualLeave(hireDate, 2027)).toBe(7);
      expect(calculateCasualLeaveEntitlement(hireDate, 2027, 7)).toBe(7);
    });
  });

  describe("calculateAccruedCasualLeave", () => {
    it("matches the OCD-502 bug report: hired 10 Sep 2026, as of 18 Sep 2026 -> 0 days", () => {
      const hireDate = new Date("2026-09-10");
      const asOf = new Date("2026-09-18");
      expect(calculateAccruedCasualLeave(hireDate, 2026, 7, asOf)).toBe(0);
    });

    it("accrues 0.5 days per completed month of service", () => {
      const hireDate = new Date("2026-01-10");
      expect(calculateAccruedCasualLeave(hireDate, 2026, 7, new Date("2026-02-09"))).toBe(0);
      expect(calculateAccruedCasualLeave(hireDate, 2026, 7, new Date("2026-02-10"))).toBe(0.5);
      expect(calculateAccruedCasualLeave(hireDate, 2026, 7, new Date("2026-04-10"))).toBe(1.5);
    });

    it("caps accrual at the leave type's standard max_days", () => {
      const hireDate = new Date("2020-01-01");
      expect(calculateAccruedCasualLeave(hireDate, 2026, 7, new Date("2026-06-01"))).toBe(7);
    });

    it("returns 0 for a year before the employee joined", () => {
      expect(calculateAccruedCasualLeave(new Date("2026-06-01"), 2025, 7, new Date("2026-09-18"))).toBe(0);
    });
  });
});
