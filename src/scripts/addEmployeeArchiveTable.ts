import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the
// addDocumentVaultTables.ts pattern (see that file for why this doesn't go
// through `drizzle-kit generate`).
async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function addEmployeeArchiveTable() {
  try {
    console.log('🔧 Adding Employee Archive table...');

    if (!(await tableExists('tbl_employee_archive'))) {
      await pool.query(`
        CREATE TABLE tbl_employee_archive (
          id serial PRIMARY KEY,
          employee_id varchar(50) NOT NULL,
          employee_numeric_id integer,
          snapshot json NOT NULL,
          deleted_at timestamp NOT NULL DEFAULT now(),
          deleted_by_employee_id integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          deleted_by_name varchar(255),
          created_at timestamp DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE INDEX tbl_employee_archive_employee_id_idx ON tbl_employee_archive (employee_id)
      `);
      console.log('  ✓ Created tbl_employee_archive table');
    } else {
      console.log('  ✓ tbl_employee_archive table already exists');
    }

    console.log('✅ Employee Archive table is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding Employee Archive table:', error);
    process.exit(1);
  }
}

addEmployeeArchiveTable();
