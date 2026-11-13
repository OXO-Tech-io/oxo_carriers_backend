// OCD-678: accounts (SSO/login emails) must use the corporate domain.
// Mirrors OFFICE_EMAIL_DOMAIN in oxo_carriers_frontend/lib/validation/textValidation.ts.
export const OFFICE_EMAIL_DOMAIN = 'oxoholdings.group';
export const OFFICE_EMAIL_DOMAIN_MESSAGE = `Account Email must use the @${OFFICE_EMAIL_DOMAIN} domain.`;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isOfficeEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${OFFICE_EMAIL_DOMAIN}`);
}
