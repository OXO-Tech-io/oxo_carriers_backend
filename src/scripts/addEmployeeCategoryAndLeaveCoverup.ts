import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, additive-only migration script - mirrors the
// addPermissionAndLeaveBalanceIndexes.ts pattern (see that file for why this
// doesn't go through `drizzle-kit generate`: drizzle/ is gitignored in this
// repo and its tracked snapshot has long since drifted from reality, so raw
// SQL run via a tracked script is the actual source of truth here).
//
// Adds:
// - tbl_employee.employee_category ('internal' | 'client_side') - set at
//   employee-creation time going forward (see UsersService.create);
//   existing rows stay NULL, there's nothing to backfill them with.
// - tbl_leave_requests.coverup_employee_id - the colleague covering an
//   Internal employee's work while they're on leave, required by
//   leaveService.createLeaveRequest whenever the requester is Internal.
async function addEmployeeCategoryAndLeaveCoverup() {
  try {
    logger.info('Adding tbl_employee.employee_category and tbl_leave_requests.coverup_employee_id...');

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE "employee_category" AS ENUM('internal', 'client_side');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      ALTER TABLE "tbl_employee" ADD COLUMN IF NOT EXISTS "employee_category" "employee_category";

      ALTER TABLE "tbl_leave_requests" ADD COLUMN IF NOT EXISTS "coverup_employee_id" varchar(50)
        REFERENCES "tbl_employee"("employee_id") ON DELETE SET NULL;
    `);

    logger.info('employee_category and coverup_employee_id are up to date');
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, 'Error adding employee_category / coverup_employee_id');
    process.exit(1);
  }
}

addEmployeeCategoryAndLeaveCoverup();
