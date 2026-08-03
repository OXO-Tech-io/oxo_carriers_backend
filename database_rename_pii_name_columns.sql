-- Rename tbl_employee_pii's statutory name columns to drop the NIC-specific
-- wording: full_name_as_nic -> legal_name, name_with_initials -> initials_name.
-- Run this once against production (and any other environment that hasn't
-- had it applied yet). Idempotent, safe to re-run.
--
-- Mirrors src/scripts/renamePiiNameColumns.ts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'tbl_employee_pii' AND column_name = 'full_name_as_nic'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'tbl_employee_pii' AND column_name = 'legal_name'
  ) THEN
    ALTER TABLE "tbl_employee_pii" RENAME COLUMN "full_name_as_nic" TO "legal_name";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'tbl_employee_pii' AND column_name = 'name_with_initials'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'tbl_employee_pii' AND column_name = 'initials_name'
  ) THEN
    ALTER TABLE "tbl_employee_pii" RENAME COLUMN "name_with_initials" TO "initials_name";
  END IF;
END $$;
