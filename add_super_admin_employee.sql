-- Adds a new super_admin employee.
-- first_name / last_name / email are AES-256-CBC ciphertext ("iv:hex"),
-- encrypted with the app's PII_ENCRYPTION_KEY (see src/utils/encryption.ts
-- encryptPII/hashEmail) so EmployeeModel.decryptUser() can read them back.
--
-- This Cloud SQL instance stores the app's tables under a "hris" schema
-- (not "public" like local dev) - the insert below is schema-qualified
-- accordingly. Before running, confirm this email isn't already registered
-- in THIS database (a duplicate email_hash violates
-- tbl_employee_email_hash_unique):
--   SELECT id, employee_id, role FROM "hris"."tbl_employee"
--   WHERE email_hash = '45aa13d5567bc47c36c908206b165ed800f8963e554788601ff997c64565accb';
--
-- Note: the "password" column is legacy/unused - real login credentials
-- live in Keycloak, not this table. After running this insert, provision a
-- matching Keycloak account (e.g. POST /users/:id/keycloak-accounts, or the
-- Keycloak admin console) and set its password there - this SQL alone does
-- not grant login access.

INSERT INTO "hris"."tbl_employee" (
  "employee_id",
  "email",
  "email_hash",
  "first_name",
  "last_name",
  "role"
) VALUES (
  'EMP20260002',
  '7a66f43b352514804cf6c4b3c91d1afc:dadd28d5c36111ce15260f4bbe42a2d76be9442d77b71c55a5d73843a8a0bc66',
  '45aa13d5567bc47c36c908206b165ed800f8963e554788601ff997c64565accb',
  '92efb2931f71b161751146a04d6e0597:b3d5fa517a8a90ae00548732e44c4254',
  'ae0543e304cb1f7791d84d9576e1f9f2:e9c5611a38d648dfeaf98a93c1e1ca3a',
  'super_admin'
);
