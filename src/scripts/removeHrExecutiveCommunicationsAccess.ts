import pool from '../config/database';

// Idempotent, targeted fix - NOT a schema change (no ALTER TABLE here), so it
// deliberately doesn't follow the tableExists/columnExists ALTER TABLE
// pattern the addX migration scripts use; it edits row *content* in the
// existing tbl_role_permissions table instead. Mirrors
// removeHrExecutiveDocumentVaultWrite.ts (OCD-496), the same kind of fix for
// the same root cause below.
//
// OCD-526: addRolePermissionsTable.ts's SEED_GRANTS wrongly gave HR_EXECUTIVE
// a default `communications: write` grant (copy-pasted alongside HR_MANAGER's),
// letting any HR Executive send/manage Communications - access that should be
// Administrator (super_admin, which bypasses tbl_role_permissions entirely -
// see rolePermissions.model.ts) and HR Manager only. Unlike OCD-496's
// document_vault fix, HR_EXECUTIVE should end up with *no* default
// communications grant at all (not even read), so this deletes the row
// outright rather than downgrading its access_level.
//
// Only edits the *default template* (tbl_role_permissions) - used to seed
// brand-new HR Executive users (seedDefaultPermissionsForNewUser) and to
// reset a user's grants on a role change (replaceUserPermissionsWithRoleDefaults).
// It deliberately does NOT touch any already-provisioned HR Executive's
// existing tbl_user_permissions row, since an admin may have hand-tuned that
// individually - same rationale as removeHrExecutiveDocumentVaultWrite.ts;
// re-running replaceUserPermissionsWithRoleDefaults (or this script plus a
// role re-save) is a separate, explicit action for that.
async function removeHrExecutiveCommunicationsAccess() {
  try {
    console.log("🔧 Removing hr_executive's default communications grant...");

    const existing = await pool.query(
      `SELECT access_level FROM tbl_role_permissions WHERE role = $1 AND permission_key = $2`,
      ['hr_executive', 'communications'],
    );

    if (existing.rows.length === 0) {
      console.log('  ✓ hr_executive has no communications row in tbl_role_permissions - nothing to do');
      process.exit(0);
    }

    const result = await pool.query(
      `DELETE FROM tbl_role_permissions WHERE role = $1 AND permission_key = $2`,
      ['hr_executive', 'communications'],
    );
    console.log(
      (result.rowCount ?? 0) > 0
        ? '  ✓ Removed the hr_executive communications default from tbl_role_permissions'
        : '  ✓ No matching row found to remove (already changed concurrently) - nothing to do',
    );

    console.log('✅ hr_executive no longer has a default communications grant');
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error removing hr_executive's communications grant:", error);
    process.exit(1);
  }
}

removeHrExecutiveCommunicationsAccess();
