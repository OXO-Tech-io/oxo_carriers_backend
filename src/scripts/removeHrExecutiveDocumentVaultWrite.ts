import pool from '../config/database';

// Idempotent, targeted fix - NOT a schema change (no ALTER TABLE here), so it
// deliberately doesn't follow the tableExists/columnExists ALTER TABLE
// pattern the addX migration scripts use; it edits row *content* in the
// existing tbl_role_permissions table instead, closer in spirit to
// addVendorsRolePermissions.ts's backfill.
//
// OCD-496: addRolePermissionsTable.ts's SEED_GRANTS wrongly gave HR_EXECUTIVE
// a default `document_vault: write` grant (copy-pasted alongside HR_MANAGER's),
// which let any HR Executive upload/delete Document Vault documents - access
// QA says this role should never have by default.
//
// tbl_role_permissions has one row per (role, permission_key) - a single
// access_level column, not independent read/write flags (see the
// tbl_role_permissions_role_key_unique constraint) - so "remove the write
// grant but leave read alone" means downgrading that one row from 'write' to
// 'read', not deleting it outright. Deleting it would leave HR_EXECUTIVE with
// no default document_vault grant at all, i.e. it would also take away the
// view/list access every other read-only role (employee, finance_manager,
// finance_executive, consultant) keeps by default - HR Executive should keep
// that same read-only access, per the ticket's own "should still presumably
// be able to view/list" note.
//
// Only edits the *default template* (tbl_role_permissions) - used to seed
// brand-new HR Executive users (seedDefaultPermissionsForNewUser) and to
// reset a user's grants on a role change (replaceUserPermissionsWithRoleDefaults).
// It deliberately does NOT touch any already-provisioned HR Executive's
// existing tbl_user_permissions row, since an admin may have hand-tuned that
// individually; re-running replaceUserPermissionsWithRoleDefaults (or this
// script plus a role re-save) is a separate, explicit action for that.
async function removeHrExecutiveDocumentVaultWrite() {
  try {
    console.log("🔧 Downgrading hr_executive's default document_vault grant from write to read...");

    const existing = await pool.query(
      `SELECT access_level FROM tbl_role_permissions WHERE role = $1 AND permission_key = $2`,
      ['hr_executive', 'document_vault'],
    );

    if (existing.rows.length === 0) {
      console.log('  ✓ hr_executive has no document_vault row in tbl_role_permissions - nothing to do');
      process.exit(0);
    }

    const currentLevel = (existing.rows[0] as { access_level: string }).access_level;
    if (currentLevel !== 'write') {
      console.log(`  ✓ hr_executive's document_vault grant is already '${currentLevel}' (not 'write') - nothing to do`);
      process.exit(0);
    }

    const result = await pool.query(
      `UPDATE tbl_role_permissions
         SET access_level = 'read', updated_at = now()
       WHERE role = $1 AND permission_key = $2 AND access_level = 'write'`,
      ['hr_executive', 'document_vault'],
    );
    console.log(
      (result.rowCount ?? 0) > 0
        ? "  ✓ Downgraded hr_executive's document_vault grant to 'read'"
        : "  ✓ No matching 'write' row found to downgrade (already changed concurrently) - nothing to do",
    );

    console.log('✅ hr_executive no longer has a default document_vault write grant');
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error downgrading hr_executive's document_vault grant:", error);
    process.exit(1);
  }
}

removeHrExecutiveDocumentVaultWrite();
