import pool from '../../config/database';
import { AccessLevel, PermissionAssignment, PermissionKey } from '../../common/constants/permissions';

// Plain exported functions (not a Nest service) so they're callable both from
// Nest-managed services (UsersService, PermissionsService) and from
// EmployeeModel (src/employees/Employee.ts), which is a static-method class
// used outside Nest's DI graph too - mirrors the existing
// getUserPermissionAssignments/hasPermission pattern in
// src/middleware/permissions.ts.

/** A role's current default grants (the admin-editable "template" in
 * tbl_role_permissions) - empty for a role with no defaults configured
 * (e.g. SUPER_ADMIN, which bypasses the permission table entirely; or
 * SERVICE_PROVIDER, which has none by default). */
export const getRoleDefaultPermissions = async (role: string): Promise<PermissionAssignment[]> => {
  const result = await pool.query(
    'SELECT permission_key, access_level FROM tbl_role_permissions WHERE role = $1',
    [role],
  );
  return (result.rows as Array<{ permission_key: PermissionKey; access_level: AccessLevel }>).map((row) => ({
    key: row.permission_key,
    accessLevel: row.access_level,
  }));
};

/** Every role's current default grants, grouped by role - used by the
 * bootstrap backfill (main.ts) and the admin "Role Defaults" screen. */
export const getAllRoleDefaultPermissions = async (): Promise<Record<string, PermissionAssignment[]>> => {
  const result = await pool.query('SELECT role, permission_key, access_level FROM tbl_role_permissions');
  const byRole: Record<string, PermissionAssignment[]> = {};
  for (const row of result.rows as Array<{ role: string; permission_key: PermissionKey; access_level: AccessLevel }>) {
    (byRole[row.role] ??= []).push({ key: row.permission_key, accessLevel: row.access_level });
  }
  return byRole;
};

/** Grants a brand-new (or JIT-provisioned) user their role's current default
 * permissions. Assumes the employee has no existing tbl_user_permissions rows
 * yet (true for both call sites - POST /users and Keycloak JIT provisioning),
 * so this only INSERTs, it never deletes. */
export const seedDefaultPermissionsForNewUser = async (employeeId: string, role: string): Promise<void> => {
  const grants = await getRoleDefaultPermissions(role);
  for (const grant of grants) {
    await pool.query(
      'INSERT INTO tbl_user_permissions (employee_id, permission_key, access_level) VALUES ($1, $2, $3)',
      [employeeId, grant.key, grant.accessLevel],
    );
  }
};

/** Replaces every one of a user's permissions with exactly their new role's
 * current defaults - used when an admin changes an existing user's role, so
 * their access always matches the role they're being moved to (not a mix of
 * old and new grants). Any permissions an admin had hand-tuned for that user
 * under their previous role are discarded, by design - see the role-change
 * decision recorded in OCD permissions work. */
export const replaceUserPermissionsWithRoleDefaults = async (
  employeeId: string,
  role: string,
): Promise<void> => {
  const grants = await getRoleDefaultPermissions(role);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM tbl_user_permissions WHERE employee_id = $1', [employeeId]);

    if (grants.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      grants.forEach((grant) => {
        const base = values.length;
        values.push(employeeId, grant.key, grant.accessLevel);
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
      });
      await client.query(
        `INSERT INTO tbl_user_permissions (employee_id, permission_key, access_level) VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
