import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors addPersonalEmailColumn.ts
// (same reason for not going through `drizzle-kit generate`: the tracked
// migration snapshot is out of sync with the legacy `tbl_*`-prefixed table
// names). Adds tbl_employee.active_session_id (OCD-455 - single active
// session enforcement), matching the new `activeSessionId` column in
// employee.schema.ts.
async function addEmployeeActiveSessionId() {
  try {
    console.log('🔧 Adding tbl_employee.active_session_id column...');

    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'tbl_employee'
        AND column_name = 'active_session_id'
    `);
    if (colRes.rows.length === 0) {
      await pool.query(`ALTER TABLE tbl_employee ADD COLUMN active_session_id varchar(255)`);
      console.log('  ✓ Added tbl_employee.active_session_id');
    } else {
      console.log('  ✓ tbl_employee.active_session_id already exists');
    }

    console.log('✅ tbl_employee.active_session_id is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding tbl_employee.active_session_id column:', error);
    process.exit(1);
  }
}

addEmployeeActiveSessionId();
