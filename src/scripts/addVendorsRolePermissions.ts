import pool from '../config/database';

// Idempotent, additive-only seed script - mirrors addRolePermissionsTable.ts.
//
// vendors.controller.ts used to be gated by a hardcoded RolesGuard/@Roles
// list (HR_MANAGER, HR_EXECUTIVE, FINANCE_MANAGER, FINANCE_EXECUTIVE) instead
// of the configurable `vendors` permission - tbl_role_permissions never had
// any `vendors` rows seeded for those roles (the old DEFAULT_PERMISSIONS_BY_ROLE
// constant never listed it either). Now that vendors.controller.ts checks
// `vendors` via PermissionGuard, this backfills the equivalent grant so
// those four roles keep the exact same access they already had.
const GRANTS: Array<{ role: string; accessLevel: 'read' | 'write' }> = [
  { role: 'hr_manager', accessLevel: 'write' },
  { role: 'hr_executive', accessLevel: 'write' },
  { role: 'finance_manager', accessLevel: 'write' },
  { role: 'finance_executive', accessLevel: 'write' },
];

async function addVendorsRolePermissions() {
  try {
    console.log('🔧 Backfilling default `vendors` role permissions...');

    const existingRes = await pool.query(
      `SELECT role FROM tbl_role_permissions WHERE permission_key = 'vendors' AND role = ANY($1)`,
      [GRANTS.map((g) => g.role)],
    );
    const existingRoles = new Set((existingRes.rows as Array<{ role: string }>).map((r) => r.role));

    const missing = GRANTS.filter((g) => !existingRoles.has(g.role));
    if (missing.length === 0) {
      console.log('  ✓ All roles already have a `vendors` grant - nothing to do');
      process.exit(0);
    }

    const roles = missing.map((g) => g.role);
    const levels = missing.map((g) => g.accessLevel);
    await pool.query(
      `INSERT INTO tbl_role_permissions (role, permission_key, access_level)
       SELECT r, 'vendors', l::access_level
       FROM unnest($1::varchar[], $2::varchar[]) AS x(r, l)`,
      [roles, levels],
    );
    console.log(`  ✓ Granted vendors:write to ${missing.length} role(s): ${roles.join(', ')}`);

    console.log('✅ Default vendors role permissions are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error backfilling vendors role permissions:', error);
    process.exit(1);
  }
}

addVendorsRolePermissions();
