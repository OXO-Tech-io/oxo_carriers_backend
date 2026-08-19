-- ============================================================================
-- Creates the Postgres-side super admin employee record for admin@gmail.com.
--
-- IMPORTANT - this is only half the job:
--   1. This INSERT is all SQL can do. It creates the tbl_employee row with
--      encrypted email/name (matching EmployeeModel.create()'s AES-256-CBC +
--      HMAC-SHA256 scheme exactly, via pgcrypto) so the app can actually find
--      and decrypt it - a plaintext INSERT would NOT be readable by the app.
--   2. There is still no password anywhere in Postgres - this app has none
--      (removed in drizzle/0005_remove_local_passwords.sql). The password
--      "Nimshan@12" can only be set in Keycloak: Admin Console -> your realm
--      -> Users -> Add User (email: admin@gmail.com) -> Credentials tab ->
--      set password. On first login, jwt-auth.guard.ts matches this Keycloak
--      account to the row below by email and links them automatically.
--
-- Before running: replace <PII_ENCRYPTION_KEY> below with the exact value of
-- PII_ENCRYPTION_KEY from this backend's .env (it IS set locally - I checked
-- for its presence but did not read or paste its value here on purpose).
-- Get the wrong key in and the row will be created but unreadable/unfindable
-- by the running app (decryption and the email_hash lookup will both fail).
-- ============================================================================

-- Installed into "hris" (not the default, unqualified "public") for the same
-- permission reason as the enum types in oxo_carriers_hris_schema.sql - and
-- every call below is schema-qualified (hris.digest, not digest) so it works
-- regardless of what your client's default search_path happens to be, which
-- is exactly what caused "function digest(unknown, unknown) does not exist"
-- the first time: CREATE EXTENSION with no SCHEMA clause installs into
-- whatever's first on search_path (normally "public"), and the unqualified
-- call then only resolves if that same schema is still on search_path.
-- Drop first in case an earlier attempt already created it in the wrong
-- schema (e.g. "public", from before this file schema-qualified things) -
-- IF NOT EXISTS alone wouldn't move it, and the hris.* calls below would
-- still fail to resolve.
DROP EXTENSION IF EXISTS pgcrypto;
CREATE EXTENSION pgcrypto SCHEMA hris;

DO $$
DECLARE
  pii_key      bytea := hris.digest('<PII_ENCRYPTION_KEY>', 'sha256'); -- same as getPiiKeyBuffer()
  email_plain  text  := 'admin@gmail.com';
  first_plain  text  := 'Admin';
  last_plain   text  := 'Super';
  emp_id_val   text  := 'SA001';
  iv_email     bytea := hris.gen_random_bytes(16);
  iv_first     bytea := hris.gen_random_bytes(16);
  iv_last      bytea := hris.gen_random_bytes(16);
BEGIN
  INSERT INTO "hris"."tbl_employee" (
    employee_id, email, email_hash, first_name, last_name, role, status
  ) VALUES (
    emp_id_val,
    encode(iv_email, 'hex') || ':' || encode(hris.encrypt_iv(email_plain::bytea, pii_key, iv_email, 'aes-cbc/pad:pkcs'), 'hex'),
    encode(hris.hmac(lower(trim(email_plain))::bytea, pii_key, 'sha256'), 'hex'),
    encode(iv_first, 'hex') || ':' || encode(hris.encrypt_iv(first_plain::bytea, pii_key, iv_first, 'aes-cbc/pad:pkcs'), 'hex'),
    encode(iv_last, 'hex') || ':' || encode(hris.encrypt_iv(last_plain::bytea, pii_key, iv_last, 'aes-cbc/pad:pkcs'), 'hex'),
    'super_admin',
    'active'
  )
  ON CONFLICT ("employee_id") DO NOTHING;
END $$;
