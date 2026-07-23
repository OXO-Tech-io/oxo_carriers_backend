import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import pool from '../../config/database';
import {
  AccessLevel,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PermissionAssignment,
  PermissionKey,
} from '../../constants/permissions';
import { PERMISSION_QUERIES, USER_QUERIES } from '../../constants/dbQueries';
import { getUserPermissionAssignments } from '../../middleware/permissions';
import { EmployeeModel } from '../../models/Employee';

@Injectable()
export class PermissionsService {
  getCatalog() {
    return PERMISSION_CATALOG;
  }

  async getManageableUsers() {
    const result = await pool.query(USER_QUERIES.SELECT_ALL_USERS_FOR_PERMISSIONS);
    return result.rows;
  }

  async getMyPermissions(userId: number) {
    const assignments = await getUserPermissionAssignments(userId);
    return {
      userId,
      assignments,
      permissionLevels: this.toPermissionLevels(assignments),
      permissions: assignments.map((item) => item.key),
    };
  }

  async getUserPermissions(userId: number) {
    const targetUser = await EmployeeModel.findById(userId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const assignments = await getUserPermissionAssignments(userId);
    return {
      userId,
      assignments,
      permissionLevels: this.toPermissionLevels(assignments),
      permissions: assignments.map((item) => item.key),
    };
  }

  async getAllUserPermissions() {
    const result = await pool.query(PERMISSION_QUERIES.GET_ALL_USER_PERMISSIONS);

    const assignments: Record<number, PermissionAssignment[]> = {};
    const permissionLevels: Record<number, Record<PermissionKey, AccessLevel>> = {};

    for (const row of result.rows as Array<{
      user_id: number;
      permission_key: PermissionKey;
      access_level: AccessLevel;
    }>) {
      if (!assignments[row.user_id]) {
        assignments[row.user_id] = [];
      }
      if (!permissionLevels[row.user_id]) {
        permissionLevels[row.user_id] = {} as Record<PermissionKey, AccessLevel>;
      }
      assignments[row.user_id].push({ key: row.permission_key, accessLevel: row.access_level });
      permissionLevels[row.user_id][row.permission_key] = row.access_level;
    }

    return { assignments, permissionLevels };
  }

  async replaceUserPermissions(actorId: number, userId: number, rawPermissions: unknown[]) {
    const targetUser = await EmployeeModel.findById(userId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const seenKeys = new Set<string>();
    const assignments: PermissionAssignment[] = [];

    for (const item of rawPermissions) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Each permission must be an object with key and accessLevel');
      }

      const key = (item as Record<string, unknown>).key as string;
      const accessLevel = (item as Record<string, unknown>).accessLevel as AccessLevel;
      if (!PERMISSION_KEYS.has(key as PermissionKey)) {
        throw new BadRequestException(`Invalid permission key: ${key}`);
      }

      if (accessLevel !== 'read' && accessLevel !== 'write') {
        throw new BadRequestException(`Invalid access level for ${key}: ${String(accessLevel)}`);
      }

      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      assignments.push({ key: key as PermissionKey, accessLevel });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tbl_user_permissions WHERE user_id = $1', [userId]);

      if (assignments.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        assignments.forEach((permission) => {
          const base = values.length;
          values.push(userId, permission.key, permission.accessLevel, actorId);
          placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        });
        await client.query(
          `INSERT INTO tbl_user_permissions (user_id, permission_key, access_level, assigned_by) VALUES ${placeholders.join(', ')}`,
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

    return {
      message: 'Permissions updated successfully',
      userId,
      assignments,
    };
  }

  private toPermissionLevels(assignments: PermissionAssignment[]): Record<PermissionKey, AccessLevel> {
    return assignments.reduce(
      (acc, item) => {
        acc[item.key] = item.accessLevel;
        return acc;
      },
      {} as Record<PermissionKey, AccessLevel>,
    );
  }
}
