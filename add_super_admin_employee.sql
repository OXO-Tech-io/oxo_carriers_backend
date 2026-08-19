-- Super admin employee record for admin@gmail.com, employee_id SA001.
--
-- email/first_name/last_name and email_hash below were computed by actually
-- running this repo's own src/utils/encryption.ts (encryptPII/hashEmail)
-- against the real PII_ENCRYPTION_KEY from .env - not hand-typed or guessed,
-- and not pgcrypto-in-SQL (which kept hitting extension/schema/overload
-- issues). The values here are ciphertext/HMAC output only; the key itself
-- was never written to this file.
--
-- This still only creates the Postgres-side row. The password "Nimshan@12"
-- has nowhere to live in Postgres (this app has no password column - see
-- drizzle/0005_remove_local_passwords.sql) - it must be set in Keycloak:
-- Admin Console -> your realm -> Users -> Add User (email: admin@gmail.com)
-- -> Credentials tab -> set password. On first login, jwt-auth.guard.ts
-- matches that Keycloak account to this row by email and links them.

INSERT INTO "hris"."tbl_employee" (
  "employee_id",
  "email",
  "email_hash",
  "first_name",
  "last_name",
  "role"
) VALUES (
  'SA001',
  'admin@gmail.com',
  '37104a358d41d8f5e1e128cdb27ed3c1375d5415035ae9849154e7965ac4530c',
  '72253304acf0867c63a53cb52d724526:d1d3a94aa1345d523687d49a9c2e61c3',
  'bcd0b7989f921ea56c470901a1cee5cb:f80c2d15376105e20fcecaf158cbe3eb',
  'super_admin'
);
