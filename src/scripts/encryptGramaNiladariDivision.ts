import pool from '../config/database';
import { env } from '../config/env';

// Idempotent migration - mirrors widenBankCodeColumns.ts / encryptEmailAndNameColumns.ts
// (see those files for why this doesn't go through `drizzle-kit generate`).
//
// tbl_employee_pii.grama_niladari_division was added as plain varchar(150) by
// addExtendedPersonalDetailsFields.ts, on the assumption that an
// administrative division alone can't identify a person. Reclassified as PII
// (it narrows down a person's residence and is only meaningful alongside the
// rest of the address, which is already encrypted) - this converts the column
// to bytea in place via ALTER COLUMN ... USING pgp_sym_encrypt(), the same
// pgcrypto convention already used for every other bytea column on this
// table, so no separate backfill pass is needed.
async function columnType(table: string, column: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT udt_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (res.rows[0] as any)?.udt_name ?? null;
}

async function run() {
  try {
    console.log('🔧 Encrypting tbl_employee_pii.grama_niladari_division...');

    const type = await columnType('tbl_employee_pii', 'grama_niladari_division');
    if (type === null) {
      console.log('  - grama_niladari_division column not found, skipping');
    } else if (type === 'bytea') {
      console.log('  ✓ grama_niladari_division is already bytea');
    } else {
      const key = env.PII_ENCRYPTION_KEY;
      await pool.query(
        `ALTER TABLE tbl_employee_pii
         ALTER COLUMN grama_niladari_division TYPE bytea
         USING CASE WHEN grama_niladari_division IS NULL THEN NULL ELSE pgp_sym_encrypt(grama_niladari_division, $1) END`,
        [key]
      );
      console.log('  ✓ Converted grama_niladari_division to bytea and encrypted existing values');
    }

    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

run();
