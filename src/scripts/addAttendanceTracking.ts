import { readFileSync } from 'fs';
import { join } from 'path';
import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, additive-only migration script - mirrors the addWorkLogDeadline.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// SQL equivalent: drizzle/0013_add_attendance_tracking.sql.
//
// Runs that file verbatim rather than re-transcribing it into JS: the .sql file
// is already idempotent (CREATE TABLE/INDEX IF NOT EXISTS, ON CONFLICT DO NOTHING,
// a guarded DO block for the singleton CHECK), so this script is just the runner.
// Only tbl_attendance has application code on top of it so far - the
// other five tables (settings, activity/idle logs, daily/productivity summaries)
// are created for forward-compatibility with the fuller time tracker, unused for
// now. Migration 0014 (desktop-agent pairing) is intentionally not run here.
async function addAttendanceTracking() {
  try {
    logger.info('Adding attendance tracking schema...');

    const sqlPath = join(__dirname, '..', '..', 'drizzle', '0013_add_attendance_tracking.sql');
    const sql = readFileSync(sqlPath, 'utf8');

    await pool.query(sql);

    logger.info('Attendance tracking schema is up to date');
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, 'Error adding attendance tracking schema');
    process.exit(1);
  }
}

addAttendanceTracking();
