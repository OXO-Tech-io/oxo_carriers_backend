import pool from '../config/database';
import { encryptPII, hashEmail } from '../utils/encryption';

// Idempotent migration - mirrors widenBankCodeColumns.ts / dropEmailVerificationColumns.ts
// (see those files for why this doesn't go through `drizzle-kit generate`).
//
// Encrypts tbl_employee.email/first_name/last_name at rest with the same
// AES-256-CBC scheme already used for bank details etc (encryptPII). Since
// that scheme uses a random IV per call, the ciphertext can't be used for
// equality lookups or the old UNIQUE constraint on email - a new
// email_hash column (deterministic, keyed HMAC via hashEmail) takes over
// as the lookup/uniqueness key. See src/models/Employee.ts for the
// corresponding read/write path changes.
//
// IMPORTANT: this overwrites plaintext email/first_name/last_name with
// ciphertext derived from PII_ENCRYPTION_KEY. That key must never be lost or
// rotated without re-encrypting this data. Back up the database before
// running this against anything other than a disposable local dev DB.
async function columnLength(table: string, column: string): Promise<number | null> {
  const res = await pool.query(
    `SELECT character_maximum_length FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (res.rows[0] as any)?.character_maximum_length ?? null;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (res.rowCount ?? 0) > 0;
}

async function findUniqueConstraintOnColumn(table: string, column: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.constraint_schema = ccu.constraint_schema
     WHERE tc.table_schema = current_schema()
       AND tc.table_name = $1
       AND tc.constraint_type = 'UNIQUE'
       AND ccu.column_name = $2`,
    [table, column]
  );
  return (res.rows[0] as any)?.constraint_name ?? null;
}

async function widenColumns() {
  for (const column of ['email', 'first_name', 'last_name']) {
    const len = await columnLength('tbl_employee', column);
    if (len !== null && len < 500) {
      await pool.query(`ALTER TABLE tbl_employee ALTER COLUMN ${column} TYPE varchar(500)`);
      console.log(`  ✓ Widened tbl_employee.${column} to varchar(500)`);
    } else {
      console.log(`  ✓ tbl_employee.${column} already wide enough`);
    }
  }
}

async function backfillEncryptedRows() {
  const result = await pool.query(
    `SELECT id, email, first_name, last_name FROM tbl_employee WHERE email_hash IS NULL`
  );
  const rows = result.rows as Array<{ id: number; email: string; first_name: string; last_name: string }>;

  if (rows.length === 0) {
    console.log('  ✓ No rows left to encrypt');
    return;
  }

  for (const row of rows) {
    await pool.query(
      `UPDATE tbl_employee SET email = $1, email_hash = $2, first_name = $3, last_name = $4 WHERE id = $5`,
      [
        encryptPII(row.email),
        hashEmail(row.email),
        encryptPII(row.first_name),
        encryptPII(row.last_name),
        row.id,
      ]
    );
  }
  console.log(`  ✓ Encrypted email/first_name/last_name for ${rows.length} employee row(s)`);
}

async function run() {
  try {
    console.log('🔧 Encrypting tbl_employee.email/first_name/last_name...');

    await widenColumns();

    if (!(await columnExists('tbl_employee', 'email_hash'))) {
      await pool.query(`ALTER TABLE tbl_employee ADD COLUMN email_hash varchar(64)`);
      console.log('  ✓ Added email_hash column');
    } else {
      console.log('  ✓ email_hash column already exists');
    }

    await backfillEncryptedRows();

    const oldEmailUnique = await findUniqueConstraintOnColumn('tbl_employee', 'email');
    if (oldEmailUnique) {
      await pool.query(`ALTER TABLE tbl_employee DROP CONSTRAINT "${oldEmailUnique}"`);
      console.log(`  ✓ Dropped old UNIQUE constraint on email (${oldEmailUnique})`);
    } else {
      console.log('  ✓ No UNIQUE constraint left on email');
    }

    const emailHashUnique = await findUniqueConstraintOnColumn('tbl_employee', 'email_hash');
    if (!emailHashUnique) {
      await pool.query(`ALTER TABLE tbl_employee ADD CONSTRAINT tbl_employee_email_hash_unique UNIQUE (email_hash)`);
      console.log('  ✓ Added UNIQUE constraint on email_hash');
    } else {
      console.log('  ✓ email_hash already has a UNIQUE constraint');
    }

    await pool.query(`ALTER TABLE tbl_employee ALTER COLUMN email_hash SET NOT NULL`);
    console.log('  ✓ email_hash set NOT NULL');

    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

run();
