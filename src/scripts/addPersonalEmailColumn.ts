import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors addProfileChangeWorkflowTables.ts
// (same reason for not going through `drizzle-kit generate`: the tracked
// migration snapshot is out of sync with the legacy `tbl_*`-prefixed table
// names). Adds tbl_employee.personal_email (OCD-449 - "Personal Email
// Address" field on the Create Employee form), matching the new
// `personalEmail` column in employee.schema.ts.
async function addPersonalEmailColumn() {
  try {
    console.log('🔧 Adding tbl_employee.personal_email column...');

    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'tbl_employee'
        AND column_name = 'personal_email'
    `);
    if (colRes.rows.length === 0) {
      await pool.query(`ALTER TABLE tbl_employee ADD COLUMN personal_email varchar(500)`);
      console.log('  ✓ Added tbl_employee.personal_email');
    } else {
      console.log('  ✓ tbl_employee.personal_email already exists');
    }

    console.log('✅ tbl_employee.personal_email is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding tbl_employee.personal_email column:', error);
    process.exit(1);
  }
}

addPersonalEmailColumn();
