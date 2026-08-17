import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the
// addGroupsTables.ts pattern (see that file for why this doesn't go through
// `drizzle-kit generate`). The equivalent SQL is also kept at
// drizzle/0018_add_document_vault.sql for history.
async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function addDocumentVaultTables() {
  try {
    console.log('🔧 Adding Document Vault tables...');

    if (!(await tableExists('tbl_documents'))) {
      await pool.query(`
        CREATE TABLE tbl_documents (
          id serial PRIMARY KEY,
          title varchar(255) NOT NULL,
          description text,
          target_type varchar(20) NOT NULL,
          created_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created tbl_documents table');
    } else {
      console.log('  ✓ tbl_documents table already exists');
    }

    if (!(await tableExists('tbl_document_recipients'))) {
      await pool.query(`
        CREATE TABLE tbl_document_recipients (
          id serial PRIMARY KEY,
          document_id integer NOT NULL REFERENCES tbl_documents(id) ON DELETE CASCADE,
          employee_id varchar(50) NOT NULL REFERENCES tbl_employee(employee_id) ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await pool.query(`
        CREATE UNIQUE INDEX tbl_document_recipients_document_id_employee_id_idx
          ON tbl_document_recipients (document_id, employee_id)
      `);
      console.log('  ✓ Created tbl_document_recipients table');
    } else {
      console.log('  ✓ tbl_document_recipients table already exists');
    }

    console.log('✅ Document Vault tables are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding Document Vault tables:', error);
    process.exit(1);
  }
}

addDocumentVaultTables();
