import { describe, expect, it } from "vitest";
import { getBankAccountRule, validateAccountNumberForBank, validateBankDetails } from "../../src/utils/bankAccountRules";

describe("getBankAccountRule", () => {
  it("prefers the longest alias (Commercial Bank of Ceylon is not Bank of Ceylon)", () => {
    expect(getBankAccountRule("Commercial Bank of Ceylon")?.bank).toBe("Commercial Bank of Ceylon");
    expect(getBankAccountRule("Bank of Ceylon")?.bank).toBe("Bank of Ceylon");
  });
  it("matches abbreviations and punctuation variants", () => {
    expect(getBankAccountRule("HNB")?.bank).toBe("Hatton National Bank");
    expect(getBankAccountRule("People's Bank")?.lengths).toEqual([15]);
  });
  it("returns null for unknown or empty banks", () => {
    expect(getBankAccountRule("Some Credit Union")).toBeNull();
    expect(getBankAccountRule("")).toBeNull();
  });
});

describe("validateAccountNumberForBank", () => {
  it("treats empty as valid (required-ness is enforced elsewhere)", () => {
    expect(validateAccountNumberForBank("", "Sampath Bank")).toBe(true);
  });
  it.each([
    ["Bank of Ceylon", "1234567890"],
    ["Sampath Bank", "123456789012"],
    ["Amana Bank", "1234567890123"],
    ["State Bank of India", "12345678901234"],
    ["Seylan Bank", "123456789012345"],
    ["Union Bank", "1234567890123456"],
    ["CDB", "123456789012345678"],
  ])("accepts a correct-length number for %s", (bank, num) => {
    expect(validateAccountNumberForBank(num, bank)).toBe(true);
  });
  it("rejects wrong lengths", () => {
    expect(validateAccountNumberForBank("123456789", "Bank of Ceylon")).not.toBe(true);
    expect(validateAccountNumberForBank("12345678901", "Bank of Ceylon")).not.toBe(true);
  });
  it("rejects non-numeric input", () => {
    expect(validateAccountNumberForBank("12345ABC90", "Bank of Ceylon")).not.toBe(true);
    expect(validateAccountNumberForBank("1234-567-890", "Bank of Ceylon")).not.toBe(true);
    expect(validateAccountNumberForBank("1234 567890", "Bank of Ceylon")).not.toBe(true);
  });
  it("enforces Standard Chartered prefixes per length", () => {
    expect(validateAccountNumberForBank("18123456789", "Standard Chartered Bank")).toBe(true);
    expect(validateAccountNumberForBank("01123456789", "Standard Chartered Bank")).toBe(true);
    expect(validateAccountNumberForBank("88123456789", "Standard Chartered Bank")).not.toBe(true);
    expect(validateAccountNumberForBank("881234567890", "Standard Chartered Bank")).toBe(true);
    expect(validateAccountNumberForBank("181234567890", "Standard Chartered Bank")).not.toBe(true);
  });
  it("falls back to 6-20 digits for unknown banks", () => {
    expect(validateAccountNumberForBank("123456", "Other Bank")).toBe(true);
    expect(validateAccountNumberForBank("12345", "Other Bank")).not.toBe(true);
    expect(validateAccountNumberForBank("123456789012345678901", undefined)).not.toBe(true);
  });
});

describe('validateBankDetails (OCD-599/600/601/602)', () => {
  const valid = {
    bankName: 'Bank of Ceylon',
    accountHolderName: "Nimal O'Brien-Perera",
    accountNumber: '1234567890',
    bankBranch: 'Colombo Fort',
    bankBranchCode: '7010',
    swiftCode: 'BCEYLKLX',
  };
  it('accepts a fully valid set, including an 11-character SWIFT code', () => {
    expect(validateBankDetails(valid)).toEqual([]);
    expect(validateBankDetails({ ...valid, swiftCode: 'bceylklxxxx' })).toEqual([]);
  });
  it('skips empty optional fields', () => {
    expect(validateBankDetails({ bankName: '', accountNumber: '' })).toEqual([]);
  });
  it('rejects emoji, digits and symbols in names', () => {
    const fields = (d: object) => validateBankDetails({ ...valid, ...d }).map((i) => i.field);
    expect(fields({ accountHolderName: 'Nimal 😀' })).toEqual(['accountHolderName']);
    expect(fields({ accountHolderName: 'Nimal123' })).toEqual(['accountHolderName']);
    expect(fields({ bankBranch: 'Fort@@' })).toEqual(['bankBranch']);
    expect(fields({ bankName: 'Bank #1' })).toContain('bankName');
  });
  it('rejects malformed branch codes', () => {
    const fields = (code: string) => validateBankDetails({ ...valid, bankBranchCode: code }).map((i) => i.field);
    expect(fields('70')).toEqual(['bankBranchCode']);
    expect(fields('7010-1')).toEqual(['bankBranchCode']);
    expect(fields('12345678901')).toEqual(['bankBranchCode']);
  });
  it('rejects SWIFT codes with a bad length or special characters', () => {
    const fields = (code: string) => validateBankDetails({ ...valid, swiftCode: code }).map((i) => i.field);
    expect(fields('BCEYLKL')).toEqual(['swiftCode']);
    expect(fields('BCEYLKLXX')).toEqual(['swiftCode']);
    expect(fields('BCEY-KLX')).toEqual(['swiftCode']);
    expect(fields('1CEYLKLX')).toEqual(['swiftCode']);
  });
  it('reports the account number rule for the selected bank', () => {
    expect(validateBankDetails({ ...valid, accountNumber: '12345' }).map((i) => i.field)).toEqual(['accountNumber']);
    expect(validateBankDetails({ ...valid, accountNumber: '12345ABC90' }).map((i) => i.field)).toEqual(['accountNumber']);
  });
});
