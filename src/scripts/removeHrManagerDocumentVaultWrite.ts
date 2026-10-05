import pool from '../config/database';

// Idempotent, targeted fix - NOT a schema change (no ALTER TABLE here); it
// edits row *content*, same family as removeHrExecutiveDocumentVaultWrite.ts.
//
// Uploading to (and deleting from) the Document Vault is Super Admin only, so
// HR_MANAGER must not hold `document_vault: write`. Every backend gate for it
// (POST /document-vaults, DELETE /document-vaults/:id, GET /documents,
// GET /employees/:id/documents for another employee) is a document_vault
// *write* check, and the frontend hides the side-nav item, the Users-table
// icon and the Upload buttons from anyone without it - so downgrading the
// grant to 'read' is the whole change. Super Admin bypasses the permission
// table, and an admin can still grant an individual HR Manager 'write' from the
// Permissions screen afterwards.
//
// Two places hold the grant, and both have to change:
//   1. tbl_role_permissions - the role *template* (what new HR Managers get, and
//      what the startup backfill in main.ts upgrades 'read' rows towards). Done
//      first: if only the user rows were downgraded, the next boot's backfill
//      would see the template still says 'write' and upgrade them straight back.
//   2. tbl_user_permissions - what the permission guard actually checks. Editing
//      the template alone does not touch already-provisioned users, so every
//      existing HR Manager's 'write' is downgraded here too. This deliberately
//      overrides any per-user grant an admin hand-tuned to 'write'; re-grant
//      those individually afterwards if needed.
//
// One row per (role|employee, permission_key) with a single access_level, so
// "remove write but keep the view" means 'write' -> 'read', not a DELETE.
// Safe to re-run: it only ever touches rows still at 'write'.
async function removeHrManagerDocumentVaultWrite() {
  const client = await pool.connect();
  try {
    console.log("🔧 Downgrading hr_manager's document_vault grant from write to read...");
    await client.query('BEGIN');

    const template = await client.query(
      `UPDATE tbl_role_permissions
          SET access_level = 'read', updated_at = now()
        WHERE role = $1 AND permission_key = $2 AND access_level = 'write'`,
      ['hr_manager', 'document_vault'],
    );
    console.log(
      (template.rowCount ?? 0) > 0
        ? "  ✓ Role template: hr_manager document_vault 'write' -> 'read'"
        : "  ✓ Role template: no hr_manager document_vault 'write' row - nothing to do",
    );

    const users = await client.query(
      `UPDATE tbl_user_permissions
          SET access_level = 'read', updated_at = now()
        WHERE permission_key = $1
          AND access_level = 'write'
          AND employee_id IN (
            SELECT employee_id FROM tbl_employee WHERE role = 'hr_manager' AND employee_id IS NOT NULL
          )`,
      ['document_vault'],
    );
    console.log(`  ✓ Existing HR Managers: downgraded ${users.rowCount ?? 0} document_vault 'write' grant(s) to 'read'`);

    await client.query('COMMIT');
    console.log('✅ hr_manager no longer has document_vault write');
    process.exit(0);
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error("❌ Error downgrading hr_manager's document_vault grant:", error);
    process.exit(1);
  } finally {
    client.release();
  }
}

removeHrManagerDocumentVaultWrite();
