import pool from '../config/database';

// Idempotent migration for the Payment Voucher approval workflow:
//
//   Finance Executive creates -> Finance Manager review -> Administrator review
//   Finance Manager creates   ->                           Administrator review
//   Administrator approves    -> payment lifecycle Unpaid -> Uploaded for Payment -> Paid
//
// What it does (all in one transaction, safe to re-run):
//   1. Adds the new tracking columns to tbl_payment_vouchers.
//   2. Converts `status` to varchar(40) (it may be a native enum or varchar on a
//      given database; varchar works for both) and drops old CHECK constraints on it.
//   3. Backfills legacy rows from the old flow (see the mapping below).
//   4. Adds CHECK constraints for the new status / payment_status values.
//   5. Re-seeds the voucher grants in tbl_role_permissions for the new role split.
//
// Legacy status mapping:
//   pending_review/pending -> pending_admin_review (old flow: created by a Finance Manager)
//   information_request -> rejected               (reason = the old executive comment)
//   rejected            -> rejected               (reason = the old executive comment)
//   approved            -> approved + unpaid      (already approved by the old reviewer; stays payable)
//   bank_upload         -> approved + uploaded_for_payment
//   paid                -> approved + paid
// Old columns (reviewed_by/at, executive_comment, resubmitted_at) are left in place.
export const VOUCHER_APPROVAL_WORKFLOW_SQL = `
BEGIN;

-- 1. Columns ------------------------------------------------------------------
-- The voucher code expects voucher_number, vat, invoice_url and the payment
-- tracking columns, which some databases (created from the old drizzle schema)
-- don't have yet; add them too. All ADD COLUMN IF NOT EXISTS, so safe anywhere.
ALTER TABLE tbl_payment_vouchers
  ADD COLUMN IF NOT EXISTS voucher_number varchar(50),
  ADD COLUMN IF NOT EXISTS vat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_url varchar(500),
  ADD COLUMN IF NOT EXISTS executive_comment text,
  ADD COLUMN IF NOT EXISTS resubmitted_at timestamp,
  ADD COLUMN IF NOT EXISTS bank_upload_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_upload_at timestamp,
  ADD COLUMN IF NOT EXISTS paid_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at timestamp,
  ADD COLUMN IF NOT EXISTS payment_status varchar(30),
  ADD COLUMN IF NOT EXISTS created_by_role varchar(50),
  ADD COLUMN IF NOT EXISTS manager_reviewed_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS admin_reviewed_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamp;

-- Number any existing rows (contiguous per year, so the app's count+1 numbering never collides).
UPDATE tbl_payment_vouchers v
   SET voucher_number = x.num
  FROM (
    SELECT id,
           'VOU-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' ||
           lpad((row_number() OVER (PARTITION BY to_char(COALESCE(created_at, now()), 'YYYY') ORDER BY id))::text, 4, '0') AS num
      FROM tbl_payment_vouchers
     WHERE voucher_number IS NULL
  ) x
 WHERE v.id = x.id;
ALTER TABLE tbl_payment_vouchers ALTER COLUMN voucher_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tbl_payment_vouchers_voucher_number_key ON tbl_payment_vouchers (voucher_number);

-- The old drizzle shape required voucher_type and description; vouchers here are
-- always vendor vouchers and the description is optional.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = 'tbl_payment_vouchers' AND column_name = 'voucher_type') THEN
    ALTER TABLE tbl_payment_vouchers ALTER COLUMN voucher_type DROP NOT NULL;
    ALTER TABLE tbl_payment_vouchers ALTER COLUMN voucher_type SET DEFAULT 'vendor';
  END IF;
END $$;
ALTER TABLE tbl_payment_vouchers ALTER COLUMN description DROP NOT NULL;

-- 2. status -> varchar(40), without old CHECK constraints ---------------------
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'tbl_payment_vouchers'::regclass
      AND c.contype = 'c'
      AND a.attname = 'status'
  LOOP
    EXECUTE format('ALTER TABLE tbl_payment_vouchers DROP CONSTRAINT %I', con.conname);
  END LOOP;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'tbl_payment_vouchers' AND column_name = 'status') <> 'character varying' THEN
    ALTER TABLE tbl_payment_vouchers ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE tbl_payment_vouchers ALTER COLUMN status TYPE varchar(40) USING status::text;
  END IF;
END $$;
ALTER TABLE tbl_payment_vouchers ALTER COLUMN status SET DEFAULT 'pending_manager_review';
ALTER TABLE tbl_payment_vouchers ALTER COLUMN status SET NOT NULL;

-- 3. Backfill legacy rows (each statement only matches un-migrated rows) ------
UPDATE tbl_payment_vouchers
   SET status = 'pending_admin_review', created_by_role = COALESCE(created_by_role, 'finance_manager')
 WHERE status IN ('pending_review', 'pending');

UPDATE tbl_payment_vouchers
   SET status = 'rejected',
       rejection_reason = COALESCE(NULLIF(BTRIM(executive_comment), ''), 'Information requested (legacy voucher)'),
       rejected_by = reviewed_by,
       rejected_at = reviewed_at
 WHERE status = 'information_request';

UPDATE tbl_payment_vouchers
   SET rejection_reason = COALESCE(NULLIF(BTRIM(executive_comment), ''), 'Rejected (legacy voucher)'),
       rejected_by = reviewed_by,
       rejected_at = reviewed_at
 WHERE status = 'rejected' AND rejection_reason IS NULL;

UPDATE tbl_payment_vouchers SET status = 'approved', payment_status = 'paid'
 WHERE status = 'paid';
UPDATE tbl_payment_vouchers SET status = 'approved', payment_status = 'uploaded_for_payment'
 WHERE status = 'bank_upload';
UPDATE tbl_payment_vouchers SET payment_status = 'unpaid'
 WHERE status = 'approved' AND payment_status IS NULL;

-- 4. Constraints --------------------------------------------------------------
ALTER TABLE tbl_payment_vouchers DROP CONSTRAINT IF EXISTS tbl_payment_vouchers_status_check;
ALTER TABLE tbl_payment_vouchers ADD CONSTRAINT tbl_payment_vouchers_status_check
  CHECK (status IN ('pending_manager_review', 'pending_admin_review', 'approved', 'rejected'));

ALTER TABLE tbl_payment_vouchers DROP CONSTRAINT IF EXISTS tbl_payment_vouchers_payment_status_check;
ALTER TABLE tbl_payment_vouchers ADD CONSTRAINT tbl_payment_vouchers_payment_status_check
  CHECK ((status = 'approved' AND payment_status IS NOT NULL AND payment_status IN ('unpaid', 'uploaded_for_payment', 'paid'))
      OR (status <> 'approved' AND payment_status IS NULL));

-- 5. Role grants --------------------------------------------------------------
-- Finance Manager: creates + first-stage review. Finance Executive: creates and
-- runs the payment lifecycle. The Administrator (super_admin) bypasses the table.
-- 'vouchers.resubmit' no longer exists (no information-request step).
DO $$
BEGIN
  IF to_regclass('tbl_role_permissions') IS NULL THEN
    RAISE NOTICE 'tbl_role_permissions not found - skipping voucher role grants';
    RETURN;
  END IF;

  DELETE FROM tbl_role_permissions WHERE permission_key = 'vouchers.resubmit';
  DELETE FROM tbl_role_permissions
   WHERE role = 'finance_manager' AND permission_key IN ('vouchers.bank_upload', 'vouchers.mark_paid');
  DELETE FROM tbl_role_permissions
   WHERE role = 'finance_executive' AND permission_key = 'vouchers.review';

  INSERT INTO tbl_role_permissions (role, permission_key, access_level)
  SELECT g.role, g.permission_key, g.access_level::access_level
  FROM (VALUES
    ('finance_manager',   'vouchers.view',        'write'),
    ('finance_manager',   'vouchers.create',      'write'),
    ('finance_manager',   'vouchers.review',      'write'),
    ('finance_executive', 'vouchers.view',        'write'),
    ('finance_executive', 'vouchers.create',      'write'),
    ('finance_executive', 'vouchers.bank_upload', 'write'),
    ('finance_executive', 'vouchers.mark_paid',   'write')
  ) AS g(role, permission_key, access_level)
  ON CONFLICT (role, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level, updated_at = now();
END $$;

COMMIT;
`;

async function addVoucherApprovalWorkflow() {
  try {
    console.log('🔧 Applying voucher approval workflow migration...');
    await pool.query(VOUCHER_APPROVAL_WORKFLOW_SQL);
    console.log('✅ Voucher approval workflow migration applied');
    process.exit(0);
  } catch (error: any) {
    // The whole script is one transaction; exiting drops the connection, which rolls it back.
    console.error('❌ Error applying voucher approval workflow migration:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  addVoucherApprovalWorkflow();
}
