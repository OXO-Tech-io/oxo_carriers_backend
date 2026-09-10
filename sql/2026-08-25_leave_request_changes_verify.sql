-- Verification queries for sql/2026-08-25_leave_request_changes.sql.
--
-- Run after the migration to check the result - decrypts the PII bytea
-- columns back to plain text so the output is directly readable (e.g. to
-- export to Excel for review). Read-only: no data is changed.
--
-- Usage (works in any SQL client - psql, DBeaver, pgAdmin, DataGrip, ...):
--   1. Replace REPLACE_WITH_DB_SCHEMA below with the schema this app's
--      tables actually live in on the database you're connecting to -
--      check that environment's DB_SCHEMA (.env / Cloud Run secret). This
--      is NOT always "hris": e.g. a local dev DB may use "public". Use the
--      same value you used in 2026-08-25_leave_request_changes.sql.
--   2. Replace REPLACE_WITH_PII_ENCRYPTION_KEY below with the actual value
--      of PII_ENCRYPTION_KEY from that same environment. Never commit the
--      real key to this file.
--   3. Run this whole file.

SET search_path TO REPLACE_WITH_DB_SCHEMA, public;
SET app.pii_key = 'REPLACE_WITH_PII_ENCRYPTION_KEY';

-- 1) tbl_employee - employee_category, work_location, and the fields moved
--    over from tbl_employee_pii by moveNonPiiFieldsToEmployee.ts.
SELECT
  employee_id,
  employee_category,
  work_location,
  date_of_birth,
  sex,
  marital_status,
  nationality,
  religion,
  spouse_date_of_birth,
  sibling_details,
  primary_school,
  secondary_school,
  grama_niladari_division,
  electorate,
  postal_code,
  linkedin_profile,
  declaration_accepted,
  declaration_accepted_at
FROM tbl_employee
ORDER BY employee_id;

-- 2) tbl_employee_pii - remaining PII columns, decrypted for readability.
SELECT
  employee_id,
  pgp_sym_decrypt(calling_name, current_setting('app.pii_key')) AS calling_name,
  pgp_sym_decrypt(spouse_nic, current_setting('app.pii_key')) AS spouse_nic,
  pgp_sym_decrypt(spouse_contact_number, current_setting('app.pii_key')) AS spouse_contact_number,
  pgp_sym_decrypt(spouse_occupation, current_setting('app.pii_key')) AS spouse_occupation,
  pgp_sym_decrypt(mother_occupation, current_setting('app.pii_key')) AS mother_occupation,
  pgp_sym_decrypt(mother_contact_number, current_setting('app.pii_key')) AS mother_contact_number,
  pgp_sym_decrypt(father_occupation, current_setting('app.pii_key')) AS father_occupation,
  pgp_sym_decrypt(father_contact_number, current_setting('app.pii_key')) AS father_contact_number,
  pgp_sym_decrypt(secondary_contact_number, current_setting('app.pii_key')) AS secondary_contact_number,
  pgp_sym_decrypt(medical_conditions, current_setting('app.pii_key')) AS medical_conditions,
  pgp_sym_decrypt(allergies, current_setting('app.pii_key')) AS allergies,
  pgp_sym_decrypt(additional_notes, current_setting('app.pii_key')) AS additional_notes
FROM tbl_employee_pii
ORDER BY employee_id;

-- 3) tbl_leave_requests - the new coverup_employee_id column, joined back
--    to the covering employee's own id for readability.
SELECT
  lr.id,
  lr.employee_id AS requester_employee_id,
  lr.coverup_employee_id,
  cover.employee_id AS coverup_employee_confirmed
FROM tbl_leave_requests lr
LEFT JOIN tbl_employee cover ON cover.employee_id = lr.coverup_employee_id
ORDER BY lr.id;

-- 4) tbl_employee_dependents - the new school column, decrypted.
SELECT
  id,
  employee_id,
  pgp_sym_decrypt(school, current_setting('app.pii_key')) AS school
FROM tbl_employee_dependents
ORDER BY employee_id, id;
