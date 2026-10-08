import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addWorkLogDeadline.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// SQL equivalent: drizzle/0027_work_log_minutes_and_edit_tracking.sql.
//
// 1. Converts tbl_work_logs from hours_spent (numeric hours) to minutes_spent
//    (integer minutes), per the requirements doc - see OCD-466.
// 2. Adds is_edited / last_modified_at so HR can tell an amended submission
//    from an original one - see OCD-464.
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows.length > 0;
}

async function addWorkLogMinutesAndEditTracking() {
  try {
    console.log('🔧 Migrating tbl_work_logs to minutes + edit tracking...');

    const hasMinutes = await columnExists('tbl_work_logs', 'minutes_spent');
    const hasHours = await columnExists('tbl_work_logs', 'hours_spent');

    if (!hasMinutes) {
      await pool.query(`ALTER TABLE tbl_work_logs ADD COLUMN minutes_spent integer`);
      console.log('  ✓ Added tbl_work_logs.minutes_spent');

      if (hasHours) {
        await pool.query(
          `UPDATE tbl_work_logs SET minutes_spent = GREATEST(1, ROUND(hours_spent * 60)::integer)`
        );
        console.log('  ✓ Backfilled minutes_spent from hours_spent (hours * 60)');
      }

      await pool.query(`UPDATE tbl_work_logs SET minutes_spent = 1 WHERE minutes_spent IS NULL`);
      await pool.query(`ALTER TABLE tbl_work_logs ALTER COLUMN minutes_spent SET NOT NULL`);
      console.log('  ✓ tbl_work_logs.minutes_spent is NOT NULL');
    } else {
      console.log('  ✓ tbl_work_logs.minutes_spent already exists');
    }

    if (hasHours) {
      await pool.query(`ALTER TABLE tbl_work_logs DROP COLUMN hours_spent`);
      console.log('  ✓ Dropped tbl_work_logs.hours_spent');
    } else {
      console.log('  ✓ tbl_work_logs.hours_spent already removed');
    }

    for (const [column, ddl] of [
      ['is_edited', 'ALTER TABLE tbl_work_logs ADD COLUMN is_edited boolean NOT NULL DEFAULT false'],
      ['last_modified_at', 'ALTER TABLE tbl_work_logs ADD COLUMN last_modified_at timestamp'],
    ] as const) {
      if (!(await columnExists('tbl_work_logs', column))) {
        await pool.query(ddl);
        console.log(`  ✓ Added tbl_work_logs.${column}`);
      } else {
        console.log(`  ✓ tbl_work_logs.${column} already exists`);
      }
    }

    console.log('✅ Work log minutes + edit tracking schema is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error migrating work log minutes + edit tracking schema:', error);
    process.exit(1);
  }
}

addWorkLogMinutesAndEditTracking();
