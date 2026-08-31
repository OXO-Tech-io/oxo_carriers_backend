import pool from '../config/database';
import { env } from '../config/env';

// Idempotent migration script - mirrors addExtendedPersonalDetailsFields.ts
// (see that file for why this doesn't go through `drizzle-kit generate`).
//
// tbl_employee_pii.date_of_birth/sex/marital_status/nationality/religion/
// spouse_date_of_birth/sibling_details/primary_school/secondary_school/
// electorate/postal_code/linkedin_profile were always stored plain there
// (never pgcrypto-encrypted like the rest of that table) - this moves them
// to tbl_employee, where they now live as columns alongside the other
// non-PII employee attributes (see employee.schema.ts).
//
// grama_niladari_division is the one exception: it was reclassified as PII
// and encrypted in place by encryptGramaNiladariDivision.ts. It moves too
// (by explicit product decision), so this script decrypts it back to plain
// text on the way across.
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows.length > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (!(await columnExists(table, column))) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`  ✓ Added ${table}.${column}`);
  } else {
    console.log(`  ✓ ${table}.${column} already exists`);
  }
}

async function dropColumn(table: string, column: string) {
  if (await columnExists(table, column)) {
    await pool.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    console.log(`  ✓ Dropped ${table}.${column}`);
  } else {
    console.log(`  - ${table}.${column} already gone, skipping`);
  }
}

async function run() {
  try {
    console.log('🔧 Moving non-PII personal/statutory fields from tbl_employee_pii to tbl_employee...');

    const newColumns: [string, string][] = [
      ['date_of_birth', 'date_of_birth date'],
      ['sex', 'sex employee_sex'],
      ['marital_status', 'marital_status marital_status'],
      ['nationality', 'nationality varchar(100)'],
      ['religion', 'religion varchar(100)'],
      ['spouse_date_of_birth', 'spouse_date_of_birth date'],
      ['sibling_details', 'sibling_details text'],
      ['primary_school', 'primary_school varchar(255)'],
      ['secondary_school', 'secondary_school varchar(255)'],
      ['grama_niladari_division', 'grama_niladari_division varchar(150)'],
      ['electorate', 'electorate varchar(150)'],
      ['postal_code', 'postal_code varchar(20)'],
      ['linkedin_profile', 'linkedin_profile varchar(255)'],
      ['declaration_accepted', 'declaration_accepted boolean DEFAULT false'],
      ['declaration_accepted_at', 'declaration_accepted_at timestamp'],
    ];
    for (const [column, ddl] of newColumns) {
      await addColumn('tbl_employee', column, ddl);
    }

    // Backfill from tbl_employee_pii, only while the source columns still
    // exist there (re-running after the drop below is a no-op).
    if (await columnExists('tbl_employee_pii', 'date_of_birth')) {
      console.log('  → Backfilling tbl_employee from tbl_employee_pii...');
      const key = env.PII_ENCRYPTION_KEY;
      await pool.query(
        `UPDATE tbl_employee e
         SET date_of_birth = p.date_of_birth,
             sex = p.sex,
             marital_status = p.marital_status,
             nationality = p.nationality,
             religion = p.religion,
             spouse_date_of_birth = p.spouse_date_of_birth,
             sibling_details = p.sibling_details,
             primary_school = p.primary_school,
             secondary_school = p.secondary_school,
             grama_niladari_division = CASE WHEN p.grama_niladari_division IS NULL THEN NULL ELSE pgp_sym_decrypt(p.grama_niladari_division, $1) END,
             electorate = p.electorate,
             postal_code = p.postal_code,
             linkedin_profile = p.linkedin_profile,
             declaration_accepted = p.declaration_accepted,
             declaration_accepted_at = p.declaration_accepted_at
         FROM tbl_employee_pii p
         WHERE p.employee_id = e.employee_id`,
        [key]
      );
      console.log('  ✓ Backfill complete');

      const oldColumns = [
        'date_of_birth',
        'sex',
        'marital_status',
        'nationality',
        'religion',
        'spouse_date_of_birth',
        'sibling_details',
        'primary_school',
        'secondary_school',
        'grama_niladari_division',
        'electorate',
        'postal_code',
        'linkedin_profile',
        'declaration_accepted',
        'declaration_accepted_at',
      ];
      for (const column of oldColumns) {
        await dropColumn('tbl_employee_pii', column);
      }
    } else {
      console.log('  - tbl_employee_pii source columns already gone, skipping backfill');
    }

    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

run();
