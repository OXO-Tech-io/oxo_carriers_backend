-- Consolidated DB migration for branch feature/leave-request-changes.
--
-- Mirrors, in commit order, the idempotent ts-node scripts already in
-- src/scripts/ (those remain the source of truth - this file exists so the
-- same changes can be applied directly with psql, without a Node/pnpm
-- environment):
--   1. addEmployeeCategoryAndLeaveCoverup.ts
--   2. addExtendedPersonalDetailsFields.ts
--   3. encryptGramaNiladariDivision.ts
--   4. encryptAdditionalNotes.ts
--   5. moveNonPiiFieldsToEmployee.ts
--
-- Safe to re-run: every step checks current state first, so it can be run
-- against a database that already has some (or all) of these changes.
--
-- Usage (works in any SQL client - psql, DBeaver, pgAdmin, DataGrip, ...):
--   1. Replace REPLACE_WITH_DB_SCHEMA below with the schema this app's
--      tables actually live in on the database you're connecting to -
--      check that environment's DB_SCHEMA (.env / Cloud Run secret).
--      This is NOT always "hris": e.g. a local dev DB may use "public".
--      Getting this wrong doesn't error - it just silently creates
--      everything in the wrong (usually empty) schema instead.
--   2. Replace REPLACE_WITH_PII_ENCRYPTION_KEY below with the actual value
--      of PII_ENCRYPTION_KEY from that same environment. Never commit the
--      real key to this file - edit it locally, run, then discard the edit
--      (or restore this placeholder) before committing anything.
--   3. Run this whole file.
--
-- The key is passed to the DO $$ ... $$ blocks further down via the
-- app.pii_key session setting and current_setting('app.pii_key'), since
-- plain SQL has no client-side variable substitution to rely on.

SET search_path TO REPLACE_WITH_DB_SCHEMA, public;
SET app.pii_key = 'REPLACE_WITH_PII_ENCRYPTION_KEY';

BEGIN;

-- ---------------------------------------------------------------------
-- 1) addEmployeeCategoryAndLeaveCoverup.ts
--    tbl_employee.employee_category ('internal' | 'client_side')
--    tbl_leave_requests.coverup_employee_id
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "employee_category" AS ENUM('internal', 'client_side');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "tbl_employee" ADD COLUMN IF NOT EXISTS "employee_category" "employee_category";

ALTER TABLE "tbl_leave_requests" ADD COLUMN IF NOT EXISTS "coverup_employee_id" varchar(50)
  REFERENCES "tbl_employee"("employee_id") ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 2) addExtendedPersonalDetailsFields.ts
--    work_location on tbl_employee; extended personal/family/health/social
--    fields on tbl_employee_pii; school on tbl_employee_dependents.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE work_location AS ENUM ('office', 'remote', 'hybrid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS work_location work_location;

-- religion/spouse_date_of_birth/sibling_details/primary_school/secondary_school/
-- grama_niladari_division/electorate/postal_code/linkedin_profile/
-- declaration_accepted/declaration_accepted_at are moved to tbl_employee and
-- dropped from tbl_employee_pii by step 5 below. Guard re-adding them here
-- so re-running this whole file after step 5 has already run doesn't put
-- them back on tbl_employee_pii with no step left to remove them again.
DO $$
DECLARE
  already_moved boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'tbl_employee'
      AND column_name = 'date_of_birth'
  ) INTO already_moved;

  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS calling_name bytea;
  IF NOT already_moved THEN
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS religion varchar(100);
  END IF;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS spouse_nic bytea;
  IF NOT already_moved THEN
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS spouse_date_of_birth date;
  END IF;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS spouse_contact_number bytea;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS spouse_occupation bytea;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS mother_occupation bytea;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS mother_contact_number bytea;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS father_occupation bytea;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS father_contact_number bytea;
  IF NOT already_moved THEN
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS sibling_details text;
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS primary_school varchar(255);
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS secondary_school varchar(255);
  END IF;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS secondary_contact_number bytea;
  IF NOT already_moved THEN
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS grama_niladari_division varchar(150);
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS electorate varchar(150);
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS postal_code varchar(20);
  END IF;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS medical_conditions bytea;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS allergies bytea;
  IF NOT already_moved THEN
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS linkedin_profile varchar(255);
  END IF;
  ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS additional_notes text;
  IF NOT already_moved THEN
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS declaration_accepted boolean DEFAULT false;
    ALTER TABLE tbl_employee_pii ADD COLUMN IF NOT EXISTS declaration_accepted_at timestamp;
  END IF;
END $$;

ALTER TABLE tbl_employee_dependents ADD COLUMN IF NOT EXISTS school bytea;

-- ---------------------------------------------------------------------
-- 3) encryptGramaNiladariDivision.ts
--    tbl_employee_pii.grama_niladari_division: varchar -> bytea (pgcrypto)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT udt_name INTO col_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'tbl_employee_pii'
    AND column_name = 'grama_niladari_division';

  IF col_type IS NOT NULL AND col_type <> 'bytea' THEN
    EXECUTE
      'ALTER TABLE tbl_employee_pii ALTER COLUMN grama_niladari_division TYPE bytea '
      'USING CASE WHEN grama_niladari_division IS NULL THEN NULL '
      'ELSE pgp_sym_encrypt(grama_niladari_division, current_setting(''app.pii_key'')) END';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4) encryptAdditionalNotes.ts
--    tbl_employee_pii.additional_notes: text -> bytea (pgcrypto)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT udt_name INTO col_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'tbl_employee_pii'
    AND column_name = 'additional_notes';

  IF col_type IS NOT NULL AND col_type <> 'bytea' THEN
    EXECUTE
      'ALTER TABLE tbl_employee_pii ALTER COLUMN additional_notes TYPE bytea '
      'USING CASE WHEN additional_notes IS NULL THEN NULL '
      'ELSE pgp_sym_encrypt(additional_notes, current_setting(''app.pii_key'')) END';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5) moveNonPiiFieldsToEmployee.ts
--    Move non-PII personal/statutory fields from tbl_employee_pii to
--    tbl_employee, backfill existing rows, then drop the old columns.
--    grama_niladari_division is decrypted back to plain text on the way
--    across (it was encrypted in place by step 3 above; the move to
--    tbl_employee reclassifies it as non-PII again).
-- ---------------------------------------------------------------------
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS sex employee_sex;
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS marital_status marital_status;
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS nationality varchar(100);
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS religion varchar(100);
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS spouse_date_of_birth date;
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS sibling_details text;
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS primary_school varchar(255);
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS secondary_school varchar(255);
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS grama_niladari_division varchar(150);
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS electorate varchar(150);
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS postal_code varchar(20);
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS linkedin_profile varchar(255);
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS declaration_accepted boolean DEFAULT false;
ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS declaration_accepted_at timestamp;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'tbl_employee_pii'
      AND column_name = 'date_of_birth'
  ) THEN
    EXECUTE
      'UPDATE tbl_employee e '
      'SET date_of_birth = p.date_of_birth, '
      '    sex = p.sex, '
      '    marital_status = p.marital_status, '
      '    nationality = p.nationality, '
      '    religion = p.religion, '
      '    spouse_date_of_birth = p.spouse_date_of_birth, '
      '    sibling_details = p.sibling_details, '
      '    primary_school = p.primary_school, '
      '    secondary_school = p.secondary_school, '
      '    grama_niladari_division = CASE WHEN p.grama_niladari_division IS NULL THEN NULL '
      '                                   ELSE pgp_sym_decrypt(p.grama_niladari_division, current_setting(''app.pii_key'')) END, '
      '    electorate = p.electorate, '
      '    postal_code = p.postal_code, '
      '    linkedin_profile = p.linkedin_profile, '
      '    declaration_accepted = p.declaration_accepted, '
      '    declaration_accepted_at = p.declaration_accepted_at '
      'FROM tbl_employee_pii p '
      'WHERE p.employee_id = e.employee_id';

    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS date_of_birth;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS sex;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS marital_status;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS nationality;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS religion;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS spouse_date_of_birth;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS sibling_details;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS primary_school;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS secondary_school;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS grama_niladari_division;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS electorate;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS postal_code;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS linkedin_profile;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS declaration_accepted;
    ALTER TABLE tbl_employee_pii DROP COLUMN IF EXISTS declaration_accepted_at;
  END IF;
END $$;

COMMIT;
