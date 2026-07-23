import pool from "../config/database";
import {
  AccessLevel,
  PermissionAssignment,
  PermissionKey,
} from "../constants/permissions";
import { PERMISSION_QUERIES } from "../constants/dbQueries";

// tbl_user_permissions is keyed by the caller's business employee_id (varchar),
// not the numeric tbl_employee.id - callers should pass JwtPayload.employeeId.
export const getUserPermissionAssignments = async (
  employeeId: string,
): Promise<PermissionAssignment[]> => {
  const result = await pool.query(
    PERMISSION_QUERIES.GET_USER_PERMISSIONS,
    [employeeId],
  );

  return (
    result.rows as Array<{ permission_key: PermissionKey; access_level: AccessLevel }>
  ).map((row) => ({
    key: row.permission_key,
    accessLevel: row.access_level,
  }));
};

export const getUserPermissionKeys = async (
  employeeId: string,
): Promise<PermissionKey[]> => {
  const assignments = await getUserPermissionAssignments(employeeId);
  return assignments.map((item) => item.key);
};

export const hasPermission = async (
  employeeId: string,
  permissionKey: PermissionKey,
  requiredLevel: AccessLevel = "read",
): Promise<boolean> => {
  const result = await pool.query(
    PERMISSION_QUERIES.CHECK_PERMISSION,
    [employeeId, permissionKey, requiredLevel],
  );

  return (result.rows as any[]).length > 0;
};
