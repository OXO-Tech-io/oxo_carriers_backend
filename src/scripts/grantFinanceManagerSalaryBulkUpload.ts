import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, targeted fix - row *content* only, no ALTER TABLE (same shape as
// grantFinanceManagerSalariesWrite.ts).
//
// Admin > Bulk Upload (the salary Excel upload) was split out of `salaries` into
// its own `salary_bulk_upload` permission: the side-nav item, the page and both
// backend endpoints (GET /salaries/bulk-uploads/templates, POST
// /salaries/bulk-uploads) all check `salary_bulk_upload` write. Finance Manager
// is meant to run it, but only finance_executive was given a default for the new
// key, so Finance Manager had no Bulk Upload menu item and a direct call
// answered 403.
//
// tbl_role_permissions holds one row per (role, permission_key) with a single
// access_level, so this upserts that row to 'write'.
//
// Only edits the default template. Existing finance_manager accounts get the
// grant from the role-default backfill in main.ts on the next boot (it inserts
// any template grant a user is missing and never touches hand-tuned grants), and
// new finance managers are seeded from the template on creation.
async function grantFinanceManagerSalaryBulkUpload() {
  try {
    logger.info("Setting finance_manager's default salary_bulk_upload grant to write...");

    const result = await pool.query(
      `INSERT INTO tbl_role_permissions (role, permission_key, access_level)
       VALUES ('finance_manager', 'salary_bulk_upload', 'write')
       ON CONFLICT (role, permission_key)
       DO UPDATE SET access_level = 'write', updated_at = now()
       WHERE tbl_role_permissions.access_level <> 'write'`,
    );

    logger.info(
      (result.rowCount ?? 0) > 0
        ? "finance_manager's salary_bulk_upload grant is now 'write' - restart the backend so existing finance managers pick it up"
        : "finance_manager's salary_bulk_upload grant was already 'write' - nothing to do",
    );
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, "Error updating finance_manager's salary_bulk_upload grant");
    process.exit(1);
  }
}

grantFinanceManagerSalaryBulkUpload();
