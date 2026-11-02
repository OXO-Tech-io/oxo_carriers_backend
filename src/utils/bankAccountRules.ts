// OCD-598: per-bank account number rules. The rules and the fallback digit
// range live in tbl_bank_account_rules / tbl_bank_account_settings and are
// loaded into memory by BankAccountRulesService (on startup, then on a refresh
// interval) - validation runs inside synchronous Zod refinements, so it can't
// query the database itself. The frontend fetches the same data from
// GET /bank-account-rules.
//
// The bank is captured as free text, so a rule is resolved by matching the
// entered name against known aliases. Unrecognised banks fall back to the
// generic numeric digit range. No supported bank uses alphanumeric account
// numbers, so every rule is digits-only.

export interface BankAccountRule {
  bank: string;
  aliases: string[];
  lengths: number[];
  /** Optional prefix constraint keyed by length (e.g. Standard Chartered: { "11": ["18", "01"] }). */
  prefixes?: Record<string, string[]> | null;
}

export interface BankAccountRulesConfig {
  rules: BankAccountRule[];
  fallbackAccountNumberMin: number;
  fallbackAccountNumberMax: number;
}

const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

let config: BankAccountRulesConfig | null = null;

/** Replaces the in-memory rules. Aliases are normalised so table edits like "BOC" still match. */
export function setBankAccountRulesConfig(next: BankAccountRulesConfig): void {
  config = {
    ...next,
    rules: next.rules.map((rule) => ({ ...rule, aliases: rule.aliases.map(normalise).filter(Boolean) })),
  };
}

export function getBankAccountRulesConfig(): BankAccountRulesConfig {
  if (!config) throw new Error('Bank account rules have not been loaded from the database yet');
  return config;
}

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
  for (const rule of getBankAccountRulesConfig().rules) {
    for (const alias of rule.aliases) {
      const matches = alias.length <= 5 ? name === alias : name.includes(alias);
      if (matches && (!best || alias.length > best.length)) best = { rule, length: alias.length };
    }
  }
  return best?.rule ?? null;
}

export function describeBankAccountRule(bankName: string | null | undefined): string {
  const rule = getBankAccountRule(bankName);
  if (!rule) {
    const { fallbackAccountNumberMin: min, fallbackAccountNumberMax: max } = getBankAccountRulesConfig();
    return `Numeric digits only (${min}-${max} digits)`;
  }
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
    const { fallbackAccountNumberMin: min, fallbackAccountNumberMax: max } = getBankAccountRulesConfig();
    return value.length >= min && value.length <= max
      ? true
      : `Bank account number must contain ${min}-${max} numeric digits only.`;
  }

  if (!rule.lengths.includes(value.length)) {
    return `${rule.bank} account numbers must be ${rule.lengths.join(' or ')} digits long.`;
  }
  const allowed = rule.prefixes?.[String(value.length)];
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
