import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addWorkLogDeadline.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// SQL equivalent: drizzle/meta diff for notices.schema.ts's new startAt/endAt columns.
//
// OCD-565: adds notice scheduling (start/end date-time window) to tbl_notices.
// Both columns are nullable at the DB level so this never breaks existing
// rows - the DTO enforces `startAt` as required for NEW notices going
// forward (see create-notice.dto.ts), while `endAt` stays optional (no end
// date = never expires). `start_at` gets a DEFAULT now() so this ALTER
// TABLE immediately backfills every pre-existing row to "already started" -
// they keep displaying under the new
// `isActive AND now() BETWEEN startAt AND (endAt OR infinity)` rule in
// NoticesService.listActive() instead of disappearing until someone edits
// them. `end_at` has no default (null = never expires).
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

async function addNoticeScheduleFields() {
  try {
    console.log('🔧 Adding notice scheduling fields...');

    if (!(await tableExists('tbl_notices'))) {
      console.log('  ⚠ tbl_notices table does not exist - nothing to migrate, skipping');
      process.exit(0);
    }

    for (const [column, ddl] of [
      ['start_at', 'ALTER TABLE tbl_notices ADD COLUMN start_at timestamp DEFAULT now()'],
      ['end_at', 'ALTER TABLE tbl_notices ADD COLUMN end_at timestamp'],
    ] as const) {
      if (!(await columnExists('tbl_notices', column))) {
        await pool.query(ddl);
        console.log(`  ✓ Added tbl_notices.${column}`);
      } else {
        console.log(`  ✓ tbl_notices.${column} already exists`);
      }
    }

    // Backfill safety net: any row where start_at is still null (e.g. the
    // column already existed without the DEFAULT from an earlier partial
    // run) gets stamped to now() so it isn't hidden by the new schedule
    // window filter in NoticesService.listActive().
    const backfilled = await pool.query(`UPDATE tbl_notices SET start_at = now() WHERE start_at IS NULL`);
    console.log(
      (backfilled.rowCount ?? 0) > 0
        ? `  ✓ Backfilled start_at on ${backfilled.rowCount} pre-existing notice(s)`
        : '  ✓ No pre-existing notices needed a start_at backfill'
    );

    console.log('✅ Notice scheduling schema is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding notice scheduling fields:', error);
    process.exit(1);
  }
}

addNoticeScheduleFields();
