import { sql, type SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';
import { env } from '../config/env';

// Shared helpers for the bytea + Postgres pgcrypto (pgp_sym_encrypt/pgp_sym_decrypt)
// convention used by tbl_employee_pii and the profile-tab child tables that hold
// identity/contact secrets (employee_nominees, employee_dependents,
// employee_emergency_contacts). Extracted from EmployeePiiModel so the same
// "CASE WHEN col IS NULL THEN NULL ELSE pgp_sym_decrypt(col, key) END" pattern
// isn't hand-duplicated in every new model.

export function getPiiEncryptionKey(): string {
  return env.PII_ENCRYPTION_KEY;
}

/** Builds the SQL fragment to insert/update an encrypted bytea column. */
export function pgpEncrypt(value: string | null | undefined): SQL | null {
  if (value === null || value === undefined) return null;
  const key = getPiiEncryptionKey();
  return sql`pgp_sym_encrypt(${value}, ${key})`;
}

/** Builds the SQL fragment to select-and-decrypt an encrypted bytea column. */
export function pgpDecrypt(column: AnyColumn): SQL<string | null> {
  const key = getPiiEncryptionKey();
  return sql<string | null>`CASE WHEN ${column} IS NULL THEN NULL ELSE pgp_sym_decrypt(${column}, ${key}) END`;
}
