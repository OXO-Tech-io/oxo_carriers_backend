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

const parseUserId = (idParam: string | string[]): number => {
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return Number.parseInt(id, 10);
};

export const getPermissionCatalog = async (_req: Request, res: Response) => {
  res.json({ success: true, permissions: PERMISSION_CATALOG });
};

export const getManageableUsers = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, email, first_name, last_name, role FROM users ORDER BY first_name, last_name`,
    );

    return res.json({ success: true, users: rows });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

export const getMyPermissions = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
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
    return res.status(500).json({
      success: false,
      message: "Failed to fetch permissions",
      error: error.message,
    });
  }
};

export const getUserPermissions = async (req: Request, res: Response) => {
  try {
    const userId = parseUserId(req.params.id);
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
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user permissions",
      error: error.message,
    });
  }
};

export const getAllUserPermissions = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, permission_key, access_level FROM user_permissions ORDER BY user_id`,
    );

    const assignments: Record<number, PermissionAssignment[]> = {};
    const permissionLevels: Record<
      number,
      Record<PermissionKey, AccessLevel>
    > = {};
    for (const row of rows as Array<{
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
  const connection = await pool.getConnection();
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

    await connection.beginTransaction();
    await connection.execute("DELETE FROM user_permissions WHERE user_id = ?", [
      userId,
    ]);

    if (assignments.length > 0) {
      const placeholders = assignments.map(() => "(?, ?, ?, ?)").join(", ");
      const values = assignments.flatMap((permission) => [
        userId,
        permission.key,
        permission.accessLevel,
        actorId,
      ]);
      await connection.execute(
        `INSERT INTO user_permissions (user_id, permission_key, access_level, assigned_by) VALUES ${placeholders}`,
        values,
      );
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Permissions updated successfully",
      userId,
      assignments,
    });
  } catch (error: any) {
    await connection.rollback();
    return res.status(500).json({
      success: false,
      message: "Failed to update permissions",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};
