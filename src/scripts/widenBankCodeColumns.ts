import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the
// addProfileTabFields.ts / addSalaryColumns.ts pattern (see those files for
// why this doesn't go through `drizzle-kit generate`).
//
// tbl_employee.bank_branch_code and swift_code were added by
// addProfileTabFields.ts as plain varchar(30), sized for the raw bank/SWIFT
// code. But profileChangeRequest.service.ts encrypts every bank field
// (including these two) with encryptPII() before storing, which produces an
// "iv:ciphertext" hex string at least ~65 characters long - always longer
// than 30 chars, so approving a profile change request that edits either
// field fails with "value too long for type character varying(30)".
// bank_name/account_holder_name/account_number/bank_branch already got
// widened to 500 for the same reason; this widens the two that were missed.
async function widenBankCodeColumns() {
  try {
    console.log('🔧 Widening tbl_employee.bank_branch_code / swift_code to varchar(500)...');

    const res = await pool.query(`
      SELECT column_name, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'tbl_employee'
        AND column_name IN ('bank_branch_code', 'swift_code')
    `);

    const lengths = new Map((res.rows as any[]).map(r => [r.column_name, r.character_maximum_length]));

    if (lengths.get('bank_branch_code') !== 500) {
      await pool.query(`ALTER TABLE tbl_employee ALTER COLUMN bank_branch_code TYPE varchar(500)`);
      console.log('  ✓ Widened bank_branch_code to varchar(500)');
    } else {
      console.log('  ✓ bank_branch_code is already varchar(500)');
    }

    if (lengths.get('swift_code') !== 500) {
      await pool.query(`ALTER TABLE tbl_employee ALTER COLUMN swift_code TYPE varchar(500)`);
      console.log('  ✓ Widened swift_code to varchar(500)');
    } else {
      console.log('  ✓ swift_code is already varchar(500)');
    }

    console.log('✅ Bank code columns are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error widening bank code columns:', error);
    process.exit(1);
  }
}

widenBankCodeColumns();
