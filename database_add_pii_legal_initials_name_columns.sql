-- Adds tbl_employee_pii's statutory name columns (legal_name, initials_name)
-- on environments where they were never created at all (as opposed to
-- environments that have the old full_name_as_nic/name_with_initials names,
-- which should instead use database_rename_pii_name_columns.sql).
-- Idempotent, safe to re-run. Both are bytea (pgp_sym_encrypt output) and
-- nullable, matching src/employees/employeePii.schema.ts.

ALTER TABLE "hris"."tbl_employee_pii" ADD COLUMN IF NOT EXISTS "legal_name" bytea;
ALTER TABLE "hris"."tbl_employee_pii" ADD COLUMN IF NOT EXISTS "initials_name" bytea;
