import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, additive-only migration script - mirrors the addWorkLogDeadline.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// The equivalent drizzle/0021_add_permission_and_leave_balance_indexes.sql file
// is gitignored like the rest of drizzle/ in this repo, so the SQL is inlined
// here rather than read from disk - that keeps this script runnable from a
// fresh clone instead of only on a machine that already has that file.
//
// tbl_user_permissions and tbl_employee_leave_balance had no index beyond
// their primary key; every permission check (on every guarded request) and
// every startup permission/leave-balance sync was doing a sequential scan on
// these. Not UNIQUE: the pre-existing check-then-insert pattern in main.ts
// wasn't guarded against concurrent duplicate inserts, so production may
// already hold duplicate (employee_id, permission_key) rows.
async function addPermissionAndLeaveBalanceIndexes() {
  try {
    logger.info('Adding tbl_user_permissions / tbl_employee_leave_balance indexes...');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS "tbl_user_permissions_employee_id_permission_key_idx"
        ON "tbl_user_permissions" ("employee_id", "permission_key");

      CREATE INDEX IF NOT EXISTS "tbl_employee_leave_balance_employee_id_leave_type_id_year_idx"
        ON "tbl_employee_leave_balance" ("employee_id", "leave_type_id", "year");
    `);

    logger.info('Permission and leave balance indexes are up to date');
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, 'Error adding permission and leave balance indexes');
    process.exit(1);
  }
}

addPermissionAndLeaveBalanceIndexes();
