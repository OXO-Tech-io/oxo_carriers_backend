import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addGroupsTables.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// SQL equivalent: drizzle/0012_add_work_log_deadline.sql.
//
// Adds the org-wide work log submission deadline: a settings singleton HR edits
// from Admin > All Work Logs, plus per-entry is_late / deadline_at columns.
// Late submissions are accepted and flagged, never rejected. Weekends and
// tbl_leave_calendar dates are exempt, and that exemption is evaluated at
// submission time in work-log-deadline.service.ts - so nothing here needs to
// know about holidays, and adding one later takes effect immediately.
async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows.length > 0;
}

async function constraintExists(tableName: string, constraintName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints WHERE table_schema = current_schema() AND table_name = $1 AND constraint_name = $2`,
    [tableName, constraintName]
  );
  return res.rows.length > 0;
}

async function addWorkLogDeadline() {
  try {
    console.log('🔧 Adding work log deadline settings...');

    if (!(await tableExists('tbl_work_log_settings'))) {
      await pool.query(`
        CREATE TABLE tbl_work_log_settings (
          id serial PRIMARY KEY,
          is_enabled boolean NOT NULL DEFAULT false,
          deadline_time varchar(5) NOT NULL DEFAULT '18:00',
          timezone varchar(64) NOT NULL DEFAULT 'Asia/Colombo',
          updated_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created tbl_work_log_settings table');
    } else {
      console.log('  ✓ tbl_work_log_settings table already exists');
    }

    if (!(await constraintExists('tbl_work_log_settings', 'tbl_work_log_settings_singleton'))) {
      await pool.query(`
        ALTER TABLE tbl_work_log_settings
          ADD CONSTRAINT tbl_work_log_settings_singleton CHECK (id = 1)
      `);
      console.log('  ✓ Added singleton CHECK (id = 1)');
    } else {
      console.log('  ✓ Singleton CHECK already present');
    }

    const seeded = await pool.query(
      `INSERT INTO tbl_work_log_settings (id, is_enabled, deadline_time, timezone)
            VALUES (1, false, '18:00', 'Asia/Colombo')
       ON CONFLICT (id) DO NOTHING`
    );
    console.log(
      (seeded.rowCount ?? 0) > 0
        ? '  ✓ Seeded default settings row (deadline off, 18:00 Asia/Colombo)'
        : '  ✓ Settings row already exists - left untouched'
    );

    for (const [column, ddl] of [
      ['is_late', 'ALTER TABLE tbl_work_logs ADD COLUMN is_late boolean NOT NULL DEFAULT false'],
      ['deadline_at', 'ALTER TABLE tbl_work_logs ADD COLUMN deadline_at timestamp'],
    ] as const) {
      if (!(await columnExists('tbl_work_logs', column))) {
        await pool.query(ddl);
        console.log(`  ✓ Added tbl_work_logs.${column}`);
      } else {
        console.log(`  ✓ tbl_work_logs.${column} already exists`);
      }
    }

    await pool.query(`CREATE INDEX IF NOT EXISTS tbl_work_logs_is_late_idx ON tbl_work_logs (is_late)`);
    console.log('  ✓ tbl_work_logs_is_late_idx is in place');

    console.log('✅ Work log deadline schema is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding work log deadline schema:', error);
    process.exit(1);
  }
}

addWorkLogDeadline();
