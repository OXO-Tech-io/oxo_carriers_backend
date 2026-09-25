import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, additive-only migration script - mirrors the
// addPermissionAndLeaveBalanceIndexes.ts pattern (see that file for why this
// doesn't go through `drizzle-kit generate`). The equivalent
// drizzle/0026_medical_claims_payment_processing.sql file is gitignored like
// the rest of drizzle/ in this repo, so the SQL is inlined here rather than
// read from disk - that keeps this script runnable from a fresh clone
// instead of only on a machine that already has that file.
//
// OCD-494: tbl_medical_insurance_claims had no way to record payment
// processing (status/amount/date/reference) for an approved claim.
async function addMedicalClaimPaymentFields() {
  try {
    logger.info('Adding payment processing columns to tbl_medical_insurance_claims...');

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE "medical_payment_status" AS ENUM ('not_paid', 'partially_paid', 'paid');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await pool.query(`
      ALTER TABLE "tbl_medical_insurance_claims"
        ADD COLUMN IF NOT EXISTS "payment_status" "medical_payment_status" NOT NULL DEFAULT 'not_paid',
        ADD COLUMN IF NOT EXISTS "paid_amount" numeric(12, 2),
        ADD COLUMN IF NOT EXISTS "payment_date" date,
        ADD COLUMN IF NOT EXISTS "payment_reference" varchar(200),
        ADD COLUMN IF NOT EXISTS "paid_by" integer REFERENCES "tbl_employee"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "paid_at" timestamp;
    `);

    logger.info('tbl_medical_insurance_claims payment columns are up to date');
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, 'Error adding medical claim payment fields');
    process.exit(1);
  }
}

addMedicalClaimPaymentFields();
