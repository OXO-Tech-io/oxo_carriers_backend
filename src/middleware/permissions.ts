import pool from "../config/database";
import {
  AccessLevel,
  PermissionAssignment,
  PermissionKey,
} from "../constants/permissions";
import { PERMISSION_QUERIES } from "../constants/dbQueries";

export const getUserPermissionAssignments = async (
  userId: number,
): Promise<PermissionAssignment[]> => {
  const result = await pool.query(
    PERMISSION_QUERIES.GET_USER_PERMISSIONS,
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
    PERMISSION_QUERIES.CHECK_PERMISSION,
    [userId, permissionKey, requiredLevel],
  );

  return (result.rows as any[]).length > 0;
};
