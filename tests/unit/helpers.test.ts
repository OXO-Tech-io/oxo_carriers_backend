import { describe, it, expect } from "vitest";
import {
  calculateDaysBetween,
  formatDate,
  formatCurrency,
  validateEmail,
  validatePassword,
} from "../../src/utils/helpers";

describe("helpers utils", () => {
  it("calculateDaysBetween includes both dates", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-03");
    expect(calculateDaysBetween(start, end)).toBe(3);
  });

  it("formatDate returns US date", () => {
    expect(formatDate("2026-01-03")).toMatch(/01\/03\/2026|1\/3\/2026/);
  });

  it("formatCurrency returns USD format", () => {
    expect(formatCurrency(1000)).toContain("$");
  });

  it("validateEmail checks valid format", () => {
    expect(validateEmail("dev@example.com")).toBe(true);
    expect(validateEmail("invalid-email")).toBe(false);
  });

  it("validatePassword validates all rules", () => {
    expect(validatePassword("short").valid).toBe(false);
    expect(validatePassword("lowercase1").valid).toBe(false);
    expect(validatePassword("UPPERCASE1").valid).toBe(false);
    expect(validatePassword("NoNumber").valid).toBe(false);
    expect(validatePassword("Strong123").valid).toBe(true);
  });
});
