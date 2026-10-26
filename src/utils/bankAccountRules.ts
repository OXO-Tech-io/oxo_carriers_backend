// OCD-598: per-bank account number rules. Mirrors
// oxo_carriers_frontend/lib/validation/bankAccountRules.ts - keep both in sync.
//
// The bank is captured as free text, so a rule is resolved by matching the
// entered name against known aliases. Unrecognised banks fall back to the
// generic numeric 6-20 digit rule. No supported bank uses alphanumeric account
// numbers, so every rule is digits-only.

export interface BankAccountRule {
  bank: string;
  aliases: string[];
  lengths: number[];
  /** Optional prefix constraint per length (e.g. Standard Chartered). */
  prefixes?: Record<number, string[]>;
}

export const FALLBACK_ACCOUNT_NUMBER_MIN = 6;
export const FALLBACK_ACCOUNT_NUMBER_MAX = 20;

export const BANK_ACCOUNT_RULES: BankAccountRule[] = [
  { bank: 'Bank of Ceylon', aliases: ['bankofceylon', 'boc'], lengths: [10] },
  { bank: 'Commercial Bank of Ceylon', aliases: ['commercialbankofceylon', 'commercialbank', 'combank'], lengths: [10] },
  { bank: 'Citibank', aliases: ['citibank', 'citi'], lengths: [10] },
  { bank: 'Deutsche Bank', aliases: ['deutschebank'], lengths: [10] },
  {
    bank: 'Standard Chartered Bank',
    aliases: ['standardchartered', 'standardcharteredbank', 'scb'],
    lengths: [11, 12],
    prefixes: { 11: ['18', '01'], 12: ['88'] },
  },
  { bank: 'Cargills Bank', aliases: ['cargillsbank'], lengths: [12] },
  { bank: 'DFCC Bank', aliases: ['dfccbank', 'dfcc'], lengths: [12] },
  { bank: 'Hatton National Bank', aliases: ['hattonnationalbank', 'hnb'], lengths: [12] },
  { bank: 'HSBC', aliases: ['hsbc'], lengths: [12] },
  { bank: 'National Development Bank', aliases: ['nationaldevelopmentbank', 'ndbbank', 'ndb'], lengths: [12] },
  { bank: 'National Savings Bank', aliases: ['nationalsavingsbank', 'nsb'], lengths: [12] },
  { bank: 'Nations Trust Bank', aliases: ['nationstrustbank', 'ntb'], lengths: [12] },
  { bank: 'Pan Asia Bank', aliases: ['panasiabank', 'pabc'], lengths: [12] },
  { bank: 'Regional Development Bank', aliases: ['regionaldevelopmentbank', 'rdb'], lengths: [12] },
  { bank: 'Sampath Bank', aliases: ['sampathbank'], lengths: [12] },
  { bank: 'Amana Bank', aliases: ['amanabank'], lengths: [13] },
  { bank: 'Public Bank', aliases: ['publicbank'], lengths: [13] },
  { bank: 'Habib Bank', aliases: ['habibbank'], lengths: [13] },
  { bank: 'State Bank of India', aliases: ['statebankofindia', 'sbi'], lengths: [14] },
  { bank: "People's Bank", aliases: ['peoplesbank'], lengths: [15] },
  { bank: 'Seylan Bank', aliases: ['seylanbank'], lengths: [15] },
  { bank: 'Union Bank', aliases: ['unionbank'], lengths: [16] },
  { bank: 'CDB', aliases: ['citizensdevelopmentbusiness', 'cdbbank', 'cdb'], lengths: [18] },
];

const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Resolves the rule for a free-text bank name. Short abbreviations (<= 5
 * chars) must match the whole name; longer aliases may appear within it. The
 * longest matching alias wins so "Commercial Bank of Ceylon" is not mistaken
 * for "Bank of Ceylon".
 */
export function getBankAccountRule(bankName: string | null | undefined): BankAccountRule | null {
  const name = normalise(bankName ?? '');
  if (!name) return null;
  let best: { rule: BankAccountRule; length: number } | null = null;
  for (const rule of BANK_ACCOUNT_RULES) {
    for (const alias of rule.aliases) {
      const matches = alias.length <= 5 ? name === alias : name.includes(alias);
      if (matches && (!best || alias.length > best.length)) best = { rule, length: alias.length };
    }
  }
  return best?.rule ?? null;
}

export function describeBankAccountRule(bankName: string | null | undefined): string {
  const rule = getBankAccountRule(bankName);
  if (!rule) return `Numeric digits only (${FALLBACK_ACCOUNT_NUMBER_MIN}-${FALLBACK_ACCOUNT_NUMBER_MAX} digits)`;
  const lengths = rule.lengths.join(' or ');
  return `${rule.bank}: ${lengths} digits, numeric only`;
}

/** Returns true when valid (or empty), otherwise a user-facing error message. */
export function validateAccountNumberForBank(
  accountNumber: string | null | undefined,
  bankName: string | null | undefined,
): string | true {
  const value = (accountNumber ?? '').trim();
  if (!value) return true;
  if (!/^\d+$/.test(value)) return 'Bank account number must contain numeric digits only (no spaces, hyphens or letters).';

  const rule = getBankAccountRule(bankName);
  if (!rule) {
    return value.length >= FALLBACK_ACCOUNT_NUMBER_MIN && value.length <= FALLBACK_ACCOUNT_NUMBER_MAX
      ? true
      : `Bank account number must contain ${FALLBACK_ACCOUNT_NUMBER_MIN}-${FALLBACK_ACCOUNT_NUMBER_MAX} numeric digits only.`;
  }

  if (!rule.lengths.includes(value.length)) {
    return `${rule.bank} account numbers must be ${rule.lengths.join(' or ')} digits long.`;
  }
  const allowed = rule.prefixes?.[value.length];
  if (allowed && !allowed.some((p) => value.startsWith(p))) {
    return `${rule.bank} ${value.length}-digit account numbers must start with ${allowed.join(' or ')}.`;
  }
  return true;
}

// OCD-599/600/601/602: format rules for the remaining bank detail fields.
// Mirror BANK_NAME_PATTERN / BANK_BRANCH_CODE_PATTERN / SWIFT_CODE_PATTERN in
// oxo_carriers_frontend/lib/validation/textValidation.ts - keep both in sync.
// \p{M} keeps Sinhala/Tamil combining vowel signs valid; digits, emoji and
// other symbols fail.
export const BANK_NAME_REGEX = /^[\p{L}\p{M}\s'.-]+$/u;
export const BANK_BRANCH_CODE_REGEX = /^[A-Za-z0-9]{3,10}$/;
// 4-letter bank code, 2-letter country code, 2-character location code and an
// optional 3-character branch code (8 or 11 characters).
export const SWIFT_CODE_REGEX = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

const NAME_MESSAGE = 'must contain only letters, spaces, apostrophes, periods and hyphens';

export interface BankDetailsInput {
  bankName?: string | null;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  bankBranch?: string | null;
  bankBranchCode?: string | null;
  swiftCode?: string | null;
}

export interface BankDetailsIssue {
  field: keyof BankDetailsInput;
  message: string;
}

/** Validates every provided (non-empty) bank detail field; empty fields are skipped. */
export function validateBankDetails(details: BankDetailsInput): BankDetailsIssue[] {
  const issues: BankDetailsIssue[] = [];
  const text = (value: string | null | undefined) => (value ?? '').trim();

  if (text(details.bankName) && !BANK_NAME_REGEX.test(text(details.bankName))) {
    issues.push({ field: 'bankName', message: `Bank ${NAME_MESSAGE}` });
  }
  if (text(details.accountHolderName) && !BANK_NAME_REGEX.test(text(details.accountHolderName))) {
    issues.push({ field: 'accountHolderName', message: `Name as in Bank A/C ${NAME_MESSAGE}` });
  }
  if (text(details.bankBranch) && !BANK_NAME_REGEX.test(text(details.bankBranch))) {
    issues.push({ field: 'bankBranch', message: `Branch ${NAME_MESSAGE}` });
  }
  const accountResult = validateAccountNumberForBank(details.accountNumber, details.bankName);
  if (accountResult !== true) issues.push({ field: 'accountNumber', message: accountResult });
  if (text(details.bankBranchCode) && !BANK_BRANCH_CODE_REGEX.test(text(details.bankBranchCode))) {
    issues.push({ field: 'bankBranchCode', message: 'Branch code must be 3-10 alphanumeric characters' });
  }
  if (text(details.swiftCode) && !SWIFT_CODE_REGEX.test(text(details.swiftCode).toUpperCase())) {
    issues.push({
      field: 'swiftCode',
      message: 'SWIFT/BIC code must be 8 or 11 characters (e.g. BCEYLKLX or BCEYLKLXXXX)',
    });
  }
  return issues;
}
