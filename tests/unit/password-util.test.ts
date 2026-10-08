import { describe, it, expect } from "vitest";
import { generateSecureTemporaryPassword } from "../../src/utils/password";

describe("generateSecureTemporaryPassword", () => {
  it("generates a password of at least 12 characters", () => {
    const password = generateSecureTemporaryPassword();
    expect(password.length).toBe(12);
  });

  it("contains at least one lowercase, uppercase, digit, and special character", () => {
    const password = generateSecureTemporaryPassword();
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)).toBe(true);
  });

  it("generates different passwords on subsequent calls", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateSecureTemporaryPassword()));
    expect(passwords.size).toBeGreaterThan(1);
  });
});
