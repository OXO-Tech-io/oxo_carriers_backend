import { describe, it, expect } from "vitest";
import {
  calculateProRatedAnnualLeave,
  isFirstYear,
} from "../../src/utils/leaveCalculation";

describe("leaveCalculation utils", () => {
  it("calculates first year leave as 0.5 per remaining month", () => {
    expect(calculateProRatedAnnualLeave(new Date("2026-01-10"), 2026)).toBe(6);
    expect(calculateProRatedAnnualLeave(new Date("2026-07-15"), 2026)).toBe(3);
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
});
