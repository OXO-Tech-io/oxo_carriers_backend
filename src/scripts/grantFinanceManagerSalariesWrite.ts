import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, targeted fix - row *content* only, no ALTER TABLE (same shape as
// removeHrExecutiveDocumentVaultWrite.ts).
//
// OCD-581: Finance Manager is meant to run the salary Bulk Upload, but its
// default `salaries` grant was 'read', so Bulk Upload was missing from the side
// nav and POST /salaries/bulk-uploads (PermissionGuard salaries:write) answered
// 403. tbl_role_permissions holds one row per (role, permission_key) with a
// single access_level, so this upserts that row to 'write'.
//
// Only edits the default template. Existing finance_manager accounts are
// upgraded from 'read' to 'write' by the role-default backfill in main.ts on
// the next boot (it never downgrades and never touches hand-tuned 'write'
// grants).
async function grantFinanceManagerSalariesWrite() {
  try {
    logger.info("Setting finance_manager's default salaries grant to write...");

    const result = await pool.query(
      `INSERT INTO tbl_role_permissions (role, permission_key, access_level)
       VALUES ('finance_manager', 'salaries', 'write')
       ON CONFLICT (role, permission_key)
       DO UPDATE SET access_level = 'write', updated_at = now()
       WHERE tbl_role_permissions.access_level <> 'write'`,
    );

    logger.info(
      (result.rowCount ?? 0) > 0
        ? "finance_manager's salaries grant is now 'write'"
        : "finance_manager's salaries grant was already 'write' - nothing to do",
    );
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, "Error updating finance_manager's salaries grant");
    process.exit(1);
  }
}

grantFinanceManagerSalariesWrite();
