import { Request, Response } from "express";
import pool from "../config/database";
import {
  AccessLevel,
  PermissionAssignment,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PermissionKey,
} from "../constants/permissions";
import { getUserPermissionAssignments } from "../middleware/permissions";
import { UserModel } from "../models/User";
import { ERROR_MESSAGES, HTTP_STATUS, PERMISSION_ERRORS, USER_ERRORS } from "../constants/errorMessages";
import { USER_QUERIES, PERMISSION_QUERIES } from "../constants/dbQueries";

const parseUserId = (idParam: string | string[]): number => {
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return Number.parseInt(id, 10);
};

export const getPermissionCatalog = async (_req: Request, res: Response) => {
  res.json({ success: true, permissions: PERMISSION_CATALOG });
};

export const getManageableUsers = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      USER_QUERIES.SELECT_ALL_USERS_FOR_PERMISSIONS,
    );

    return res.json({ success: true, users: result.rows });
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: USER_ERRORS.FAILED_TO_FETCH,
      error: error.message,
    });
  }
};

export const getMyPermissions = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: ERROR_MESSAGES.UNAUTHORIZED });
    }

    const assignments = await getUserPermissionAssignments(userId);
    const permissionLevels = assignments.reduce(
      (acc, item) => {
        acc[item.key] = item.accessLevel;
        return acc;
      },
      {} as Record<PermissionKey, AccessLevel>,
    );

    return res.json({
      success: true,
      userId,
      assignments,
      permissionLevels,
      permissions: assignments.map((item) => item.key),
    });
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: PERMISSION_ERRORS.FAILED_TO_FETCH,
      error: error.message,
    });
  }
};

export const getUserPermissions = async (req: Request, res: Response) => {
  try {
    const userId = parseUserId(req.params.id);
    if (Number.isNaN(userId)) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: USER_ERRORS.INVALID_USER_ID });
    }

    const targetUser = await UserModel.findById(userId);
    if (!targetUser) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: USER_ERRORS.NOT_FOUND });
    }

    const assignments = await getUserPermissionAssignments(userId);
    const permissionLevels = assignments.reduce(
      (acc, item) => {
        acc[item.key] = item.accessLevel;
        return acc;
      },
      {} as Record<PermissionKey, AccessLevel>,
    );

    return res.json({
      success: true,
      userId,
      assignments,
      permissionLevels,
      permissions: assignments.map((item) => item.key),
    });
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: PERMISSION_ERRORS.FAILED_TO_FETCH_USER_PERMISSIONS,
      error: error.message,
    });
  }
};

export const getAllUserPermissions = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      PERMISSION_QUERIES.GET_ALL_USER_PERMISSIONS,
    );

    const assignments: Record<number, PermissionAssignment[]> = {};
    const permissionLevels: Record<
      number,
      Record<PermissionKey, AccessLevel>
    > = {};
    for (const row of result.rows as Array<{
      user_id: number;
      permission_key: PermissionKey;
      access_level: AccessLevel;
    }>) {
      if (!assignments[row.user_id]) {
        assignments[row.user_id] = [];
      }

      if (!permissionLevels[row.user_id]) {
        permissionLevels[row.user_id] = {} as Record<
          PermissionKey,
          AccessLevel
        >;
      }

      assignments[row.user_id].push({
        key: row.permission_key,
        accessLevel: row.access_level,
      });
      permissionLevels[row.user_id][row.permission_key] = row.access_level;
    }

    return res.json({ success: true, assignments, permissionLevels });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch permission assignments",
      error: error.message,
    });
  }
};

export const replaceUserPermissions = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const actorId = req.user?.userId;
    const userId = parseUserId(req.params.id);

    if (!actorId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (Number.isNaN(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const targetUser = await UserModel.findById(userId);
    if (!targetUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const rawPermissions = Array.isArray(req.body?.permissions)
      ? req.body.permissions
      : null;
    if (!rawPermissions) {
      return res
        .status(400)
        .json({ success: false, message: "permissions must be an array" });
    }

    const seenKeys = new Set<string>();
    const assignments: PermissionAssignment[] = [];

    for (const item of rawPermissions as Array<any>) {
      if (!item || typeof item !== "object") {
        return res.status(400).json({
          success: false,
          message: "Each permission must be an object with key and accessLevel",
        });
      }

      const key = item.key as string;
      const accessLevel = item.accessLevel as AccessLevel;
      if (!PERMISSION_KEYS.has(key as PermissionKey)) {
        return res.status(400).json({
          success: false,
          message: `Invalid permission key: ${key}`,
        });
      }

      if (accessLevel !== "read" && accessLevel !== "write") {
        return res.status(400).json({
          success: false,
          message: `Invalid access level for ${key}: ${String(accessLevel)}`,
        });
      }

      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      assignments.push({ key: key as PermissionKey, accessLevel });
    }

    const invalidPermission = assignments.find(
      (permission) => !PERMISSION_KEYS.has(permission.key),
    );
    if (invalidPermission) {
      return res.status(400).json({
        success: false,
        message: `Invalid permission key: ${invalidPermission.key}`,
      });
    }

    await client.query("BEGIN");
    await client.query("DELETE FROM user_permissions WHERE user_id = $1", [
      userId,
    ]);

    if (assignments.length > 0) {
      const values: any[] = [];
      const placeholders: string[] = [];
      assignments.forEach((permission) => {
        const base = values.length;
        values.push(userId, permission.key, permission.accessLevel, actorId);
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`,
        );
      });
      await client.query(
        `INSERT INTO user_permissions (user_id, permission_key, access_level, assigned_by) VALUES ${placeholders.join(", ")}`,
        values,
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Permissions updated successfully",
      userId,
      assignments,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return res.status(500).json({
      success: false,
      message: "Failed to update permissions",
      error: error.message,
    });
  } finally {
    client.release();
  }
};
