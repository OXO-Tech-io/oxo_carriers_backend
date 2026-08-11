import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the
// addHrModulesTables.ts pattern (see that file for why this doesn't go
// through `drizzle-kit generate`). The equivalent SQL is also kept at
// drizzle/0010_add_groups_tables.sql for history.
async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function addGroupsTables() {
  try {
    console.log('🔧 Adding Groups tables...');

    if (!(await tableExists('tbl_groups'))) {
      await pool.query(`
        CREATE TABLE tbl_groups (
          id serial PRIMARY KEY,
          name varchar(150) NOT NULL,
          created_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created tbl_groups table');
    } else {
      console.log('  ✓ tbl_groups table already exists');
    }

    if (!(await tableExists('tbl_group_members'))) {
      await pool.query(`
        CREATE TABLE tbl_group_members (
          id serial PRIMARY KEY,
          group_id integer NOT NULL REFERENCES tbl_groups(id) ON DELETE CASCADE,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          added_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          added_at timestamp DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE UNIQUE INDEX tbl_group_members_group_id_user_id_idx
          ON tbl_group_members (group_id, user_id)
      `);
      console.log('  ✓ Created tbl_group_members table');
    } else {
      console.log('  ✓ tbl_group_members table already exists');
    }

    console.log('✅ Groups tables are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding Groups tables:', error);
    process.exit(1);
  }
}

addGroupsTables();
