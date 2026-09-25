import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Helper to get the 32-byte key buffer from the SALARY_ENCRYPTION_KEY environment variable.
 */
function getKeyBuffer(): Buffer {
  const hexKey = env.SALARY_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('SALARY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypts a plaintext string/number using AES-256-CBC.
 * Returns a colon-separated string: "iv:encryptedText".
 */
export function encryptSalary(amount: string | number | null | undefined): string | null {
  if (amount === null || amount === undefined) {
    return null;
  }

  const textToEncrypt = String(amount);
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(textToEncrypt, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a colon-separated AES-256-CBC cipher text string.
 * Returns the decrypted plaintext as a string.
 */
export function decryptSalary(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) {
    return null;
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    // If it's not formatted correctly, it might be unencrypted fallback data
    return encryptedText;
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedHex = parts[1];
    const key = getKeyBuffer();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error: any) {
    // Fallback if decryption fails (e.g. data wasn't encrypted or key mismatch)
    return encryptedText;
  }
}

/**
 * Helper to get the 32-byte key buffer derived from the PII_ENCRYPTION_KEY environment variable.
 */
function getPiiKeyBuffer(): Buffer {
  const rawKey = env.PII_ENCRYPTION_KEY || 'default-pii-encryption-key-must-change-in-prod';
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts a plaintext string/number using AES-256-CBC with the PII encryption key.
 * Returns a colon-separated string: "iv:encryptedText".
 */
export function encryptPII(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const textToEncrypt = String(value);
  const key = getPiiKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(textToEncrypt, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Deterministic, keyed lookup hash for an email address - encryptPII/decryptPII
 * use a random IV per call, so encrypted email can't be used for equality
 * lookups or a UNIQUE constraint directly. This HMAC (keyed with the same PII
 * encryption key, so it can't be reverse-engineered by guessing common emails
 * the way an unkeyed SHA-256 could) is the actual lookup/uniqueness key -
 * see tbl_employee.email_hash and EmployeeModel.findByEmail.
 * Normalizes (trim + lowercase) so lookups aren't sensitive to input casing.
 */
export function hashEmail(email: string): string {
  const key = getPiiKeyBuffer();
  return crypto.createHmac('sha256', key).update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Deterministic, keyed, non-reversible hash for correlating a sensitive
 * identifier (e.g. employeeId) across log lines without ever writing the
 * identifier itself to logs. Keyed with the PII encryption key so it can't be
 * reverse-engineered by brute-forcing common IDs the way an unkeyed hash could.
 * Truncated to 16 hex chars - this is for log correlation, not for lookups or
 * uniqueness, so full collision resistance isn't required.
 */
export function hashIdentifier(value: string | number): string {
  const key = getPiiKeyBuffer();
  return crypto.createHmac('sha256', key).update(String(value)).digest('hex').slice(0, 16);
}

/**
 * Decrypts a colon-separated AES-256-CBC cipher text string using the PII encryption key.
 * Returns the decrypted plaintext as a string.
 */
export function decryptPII(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) {
    return null;
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    // If it's not formatted correctly, it might be unencrypted fallback data
    return encryptedText;
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedHex = parts[1];
    const key = getPiiKeyBuffer();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error: any) {
    // Fallback if decryption fails (e.g. data wasn't encrypted or key mismatch)
    return encryptedText;
  }
}
