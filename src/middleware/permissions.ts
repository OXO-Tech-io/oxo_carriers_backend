import pool from "../config/database";
import {
  AccessLevel,
  PermissionAssignment,
  PermissionKey,
} from "../constants/permissions";

export const getUserPermissionAssignments = async (
  userId: number,
): Promise<PermissionAssignment[]> => {
  const [rows] = await pool.execute(
    `SELECT permission_key, access_level FROM user_permissions WHERE user_id = ?`,
    [userId],
  );

  return (
    rows as Array<{ permission_key: PermissionKey; access_level: AccessLevel }>
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
  const [rows] = await pool.execute(
    `SELECT 1
     FROM user_permissions
     WHERE user_id = ?
       AND permission_key = ?
       AND (
         access_level = 'write'
         OR (? = 'read' AND access_level = 'read')
       )
     LIMIT 1`,
    [userId, permissionKey, requiredLevel],
  );

  return (rows as any[]).length > 0;
};
