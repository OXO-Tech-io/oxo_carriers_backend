/**
 * OCD-447: Strong password policy shared by every code path that persists a
 * user-supplied password. Mirrors `lib/validation/passwordPolicy.ts` in the
 * frontend so the real-time UI checklist and this server-side gate agree on
 * exactly the same rules - the frontend copy is a UX convenience only, this
 * module is the actual security control (never trust client-side validation
 * alone for a password policy).
 *
 * Wired into `keycloakAdminService.updatePassword` (see that file) - the one
 * place in this backend that actually writes a password credential into
 * Keycloak. `generateSecureTemporaryPassword()` already satisfies every rule
 * below, so this is a no-op for the existing HR-triggered temp-password
 * reset flow; it becomes a real gate the moment any self-service
 * "user types their own new password" endpoint is wired up to call the same
 * function (there isn't one yet - see the AuthController doc comment).
 */

export interface PasswordRuleResult {
  id: string;
  label: string;
  passed: boolean;
}

export interface PasswordPolicyResult {
  isValid: boolean;
  rules: PasswordRuleResult[];
  /** Convenience list of just the failing rule labels, for error messages. */
  failedMessages: string[];
}

export const PASSWORD_MIN_LENGTH = 8;

// Small denylist of common/easily-guessable passwords called out in OCD-447.
// Deliberately not exhaustive (a full breach-corpus check is out of scope) -
// just enough to block the obvious examples from the ticket and README.
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  [
    'password',
    'password1',
    'password123',
    '12345678',
    '123456789',
    '1234567890',
    'qwerty123',
    'qwertyuiop',
    'letmein123',
    'admin1234',
    'welcome123',
    'iloveyou1',
    'abc123456',
    '11111111',
    '00000000',
    'changeme1',
  ].map((p) => p.toLowerCase())
);

const SPECIAL_CHAR_PATTERN = /[!@#$%^&*(),.?":{}|<>_\-+=[\]/\\~`';]/;

export const evaluatePasswordPolicy = (password: string): PasswordPolicyResult => {
  const value = password ?? '';

  const rules: PasswordRuleResult[] = [
    {
      id: 'minLength',
      label: `Minimum ${PASSWORD_MIN_LENGTH} characters`,
      passed: value.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'uppercase',
      label: 'Contains an uppercase letter (A-Z)',
      passed: /[A-Z]/.test(value),
    },
    {
      id: 'lowercase',
      label: 'Contains a lowercase letter (a-z)',
      passed: /[a-z]/.test(value),
    },
    {
      id: 'digit',
      label: 'Contains a number (0-9)',
      passed: /[0-9]/.test(value),
    },
    {
      id: 'specialChar',
      label: 'Contains a special character (e.g. @ # $ % & * !)',
      passed: SPECIAL_CHAR_PATTERN.test(value),
    },
    {
      id: 'notCommon',
      label: 'Not a common or easily guessable password',
      passed: value.length > 0 && !COMMON_PASSWORDS.has(value.toLowerCase()),
    },
  ];

  return {
    isValid: rules.every((r) => r.passed),
    rules,
    failedMessages: rules.filter((r) => !r.passed).map((r) => r.label),
  };
};

export const isPasswordPolicyCompliant = (password: string): boolean =>
  evaluatePasswordPolicy(password).isValid;
