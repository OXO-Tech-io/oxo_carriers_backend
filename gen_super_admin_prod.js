// Standalone - no repo checkout needed. Run wherever PII_ENCRYPTION_KEY is
// actually set for production (Cloud Shell with it exported, or your own
// terminal with it temporarily exported for this one command). Never paste
// the key itself anywhere - only the printed SQL output is safe to share.
//
// Usage:
//   PII_ENCRYPTION_KEY="<the real production value>" node gen_super_admin_prod.js
//
// This mirrors src/utils/encryption.ts's encryptPII()/hashEmail() exactly
// (AES-256-CBC with a random IV per field, format "iv:ciphertext"; HMAC-SHA256
// keyed with sha256(rawKey) for the lookup hash) - same algorithm, so the
// output is byte-for-byte what EmployeeModel.create() would have produced.

const crypto = require('crypto');

const rawKey = process.env.PII_ENCRYPTION_KEY;
if (!rawKey) {
  console.error('Set PII_ENCRYPTION_KEY in the environment before running this.');
  process.exit(1);
}

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getPiiKeyBuffer() {
  return crypto.createHash('sha256').update(rawKey).digest();
}

function encryptPII(value) {
  if (value === null || value === undefined) return null;
  const key = getPiiKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(String(value), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function hashEmail(email) {
  const key = getPiiKeyBuffer();
  return crypto.createHmac('sha256', key).update(email.trim().toLowerCase()).digest('hex');
}

const email = 'admin@gmail.com';
const firstName = 'Super';
const lastName = 'Admin';
const employeeId = 'SA001';

const encEmail = encryptPII(email);
const emailHash = hashEmail(email);
const encFirst = encryptPII(firstName);
const encLast = encryptPII(lastName);

console.log(`-- Run this against the PRODUCTION database.
-- Fixes the existing SA001 row (inserted earlier with the wrong key) so its
-- email/email_hash/first_name/last_name match what the live backend actually
-- computes with its real PII_ENCRYPTION_KEY.

UPDATE "hris"."tbl_employee" SET
  "email" = '${encEmail}',
  "email_hash" = '${emailHash}',
  "first_name" = '${encFirst}',
  "last_name" = '${encLast}'
WHERE "employee_id" = 'SA001';
`);
