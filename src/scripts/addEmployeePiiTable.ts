import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the
// addProfileChangeWorkflowTables.ts pattern already used in this repo for
// targeted schema changes that don't go through `drizzle-kit generate` (the
// tracked migration snapshot in drizzle/meta/ is out of sync with legacy
// `tbl_*`-prefixed table names). The equivalent SQL is also kept at
// drizzle/0007_add_employee_pii.sql for history, consistent with 0004/0005/0006.
async function addEmployeePiiTable() {
  try {
    console.log('🔧 Adding Employee PII table...');

    // 1. pgcrypto extension (needed for pgp_sym_encrypt/pgp_sym_decrypt)
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    console.log('  ✓ pgcrypto extension is enabled');

    // 2. tbl_employee_pii table
    const tableRes = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'tbl_employee_pii'
    `);
    if (tableRes.rows.length === 0) {
      await pool.query(`
        CREATE TABLE tbl_employee_pii (
          id serial PRIMARY KEY,
          employee_id varchar(50) NOT NULL UNIQUE
            REFERENCES users(employee_id) ON DELETE CASCADE ON UPDATE CASCADE,
          passport_number bytea,
          national_id bytea,
          address bytea,
          emergency_contact_name bytea,
          emergency_contact_phone bytea,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created tbl_employee_pii table');
    } else {
      console.log('  ✓ tbl_employee_pii table already exists');
    }

    console.log('✅ Employee PII table is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding Employee PII table:', error);
    process.exit(1);
  }
}

addEmployeePiiTable();
