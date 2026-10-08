import pool from '../config/database';
import { env } from '../config/env';

// Idempotent migration - mirrors encryptGramaNiladariDivision.ts (see that
// file for why this doesn't go through `drizzle-kit generate`).
//
// tbl_employee_pii.additional_notes was added as plain text by
// addExtendedPersonalDetailsFields.ts. It's free-form text an employee can
// use to disclose anything about themselves, so reclassified as PII - this
// converts the column to bytea in place via ALTER COLUMN ... USING
// pgp_sym_encrypt(), the same pgcrypto convention already used for every
// other bytea column on this table, so no separate backfill pass is needed.
async function columnType(table: string, column: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT udt_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (res.rows[0] as any)?.udt_name ?? null;
}

async function run() {
  try {
    console.log('🔧 Encrypting tbl_employee_pii.additional_notes...');

    const type = await columnType('tbl_employee_pii', 'additional_notes');
    if (type === null) {
      console.log('  - additional_notes column not found, skipping');
    } else if (type === 'bytea') {
      console.log('  ✓ additional_notes is already bytea');
    } else {
      const key = env.PII_ENCRYPTION_KEY;
      await pool.query(
        `ALTER TABLE tbl_employee_pii
         ALTER COLUMN additional_notes TYPE bytea
         USING CASE WHEN additional_notes IS NULL THEN NULL ELSE pgp_sym_encrypt(additional_notes, $1) END`,
        [key]
      );
      console.log('  ✓ Converted additional_notes to bytea and encrypted existing values');
    }

    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

run();
