import pool from "../config/database";
import {
  AccessLevel,
  PermissionAssignment,
  PermissionKey,
} from "../constants/permissions";

export const getUserPermissionAssignments = async (
  userId: number,
): Promise<PermissionAssignment[]> => {
  const result = await pool.query(
    `SELECT permission_key, access_level FROM user_permissions WHERE user_id = $1`,
    [userId],
  );

  return (
    result.rows as Array<{ permission_key: PermissionKey; access_level: AccessLevel }>
  ).map((row) => ({
    key: row.permission_key,
    accessLevel: row.access_level,
  }));
};

export const getUserPermissionKeys = async (
  userId: number,
): Promise<PermissionKey[]> => {
  const assignments = await getUserPermissionAssignments(userId);
  return assignments.map((item) => item.key);
};

export const hasPermission = async (
  userId: number,
  permissionKey: PermissionKey,
  requiredLevel: AccessLevel = "read",
): Promise<boolean> => {
  const result = await pool.query(
    `SELECT 1
     FROM user_permissions
     WHERE user_id = $1
       AND permission_key = $2
       AND (
         access_level = 'write'
         OR ($3 = 'read' AND access_level = 'read')
       )
     LIMIT 1`,
    [userId, permissionKey, requiredLevel],
  );

  return (result.rows as any[]).length > 0;
};
