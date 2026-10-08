import pool from '../config/database';

// Renames tbl_employee_pii's statutory name columns to drop the NIC-specific
// wording: full_name_as_nic -> legal_name, name_with_initials -> initials_name.
// Idempotent, safe to re-run (mirrors renameUserIdToEmployeeIdFk.ts's pattern).
const RENAMES: [string, string, string][] = [
  ['tbl_employee_pii', 'full_name_as_nic', 'legal_name'],
  ['tbl_employee_pii', 'name_with_initials', 'initials_name'],
];

async function columnExists(table: string, column: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (res.rowCount ?? 0) > 0;
}

async function run() {
  try {
    console.log('🔧 Renaming tbl_employee_pii name columns...');
    for (const [table, oldCol, newCol] of RENAMES) {
      if (await columnExists(table, newCol)) {
        console.log(`  ✓ ${table}.${newCol} already exists, skipping`);
        continue;
      }
      if (!(await columnExists(table, oldCol))) {
        console.log(`  - ${table}.${oldCol} not found, skipping`);
        continue;
      }
      await pool.query(`ALTER TABLE "${table}" RENAME COLUMN "${oldCol}" TO "${newCol}"`);
      console.log(`  ~ ${table}: renamed ${oldCol} -> ${newCol}`);
    }
    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

run();
