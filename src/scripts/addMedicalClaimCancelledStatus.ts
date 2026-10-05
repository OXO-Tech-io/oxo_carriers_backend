import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, additive-only migration script - mirrors
// addMedicalClaimPaymentFields.ts.
//
// PUT /medical-insurance-claims/:id/cancel sets status = 'cancelled', but the
// claim_status enum only had pending/approved/rejected, so it failed with
// `invalid input value for enum claim_status: "cancelled"`.
async function addMedicalClaimCancelledStatus() {
  try {
    logger.info("Adding 'cancelled' to the claim_status enum...");

    await pool.query(`ALTER TYPE "claim_status" ADD VALUE IF NOT EXISTS 'cancelled'`);

    logger.info("claim_status enum now includes 'cancelled'");
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, "Error adding 'cancelled' to claim_status");
    process.exit(1);
  }
}

addMedicalClaimCancelledStatus();
