import { describe, it, expect } from "vitest";
import {
  evaluatePasswordPolicy,
  isPasswordPolicyCompliant,
  PASSWORD_MIN_LENGTH,
} from "../../src/utils/passwordPolicy";

describe("evaluatePasswordPolicy", () => {
  it("rejects passwords shorter than the minimum length", () => {
    const result = evaluatePasswordPolicy("Ab1!");
    expect(result.isValid).toBe(false);
    expect(result.rules.find((r) => r.id === "minLength")?.passed).toBe(false);
  });

  it("requires an uppercase letter", () => {
    const result = evaluatePasswordPolicy("lowercase1!");
    expect(result.rules.find((r) => r.id === "uppercase")?.passed).toBe(false);
  });

  it("requires a lowercase letter", () => {
    const result = evaluatePasswordPolicy("UPPERCASE1!");
    expect(result.rules.find((r) => r.id === "lowercase")?.passed).toBe(false);
  });

  it("requires a digit", () => {
    const result = evaluatePasswordPolicy("NoDigitsHere!");
    expect(result.rules.find((r) => r.id === "digit")?.passed).toBe(false);
  });

  it("requires a special character", () => {
    const result = evaluatePasswordPolicy("NoSpecial123");
    expect(result.rules.find((r) => r.id === "specialChar")?.passed).toBe(false);
  });

  it("rejects passwords on the common-password denylist regardless of case", () => {
    expect(isPasswordPolicyCompliant("Password")).toBe(false);
    expect(isPasswordPolicyCompliant("QWERTY123")).toBe(false);
    expect(isPasswordPolicyCompliant("12345678")).toBe(false);
  });

  it("rejects the exact ticket examples", () => {
    expect(isPasswordPolicyCompliant("123")).toBe(false);
    expect(isPasswordPolicyCompliant("a")).toBe(false);
    expect(isPasswordPolicyCompliant("abc")).toBe(false);
    expect(isPasswordPolicyCompliant("password")).toBe(false);
  });

  it("accepts a password satisfying every rule", () => {
    const result = evaluatePasswordPolicy("Str0ng!Pass");
    expect(result.isValid).toBe(true);
    expect(result.failedMessages).toHaveLength(0);
    expect(result.rules.every((r) => r.passed)).toBe(true);
  });

  it(`accepts a password exactly ${PASSWORD_MIN_LENGTH} characters long`, () => {
    expect(isPasswordPolicyCompliant("Ab1!ab1!")).toBe(true);
  });
});
