import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import pool from '../../config/database';
import {
  AccessLevel,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PermissionAssignment,
  PermissionKey,
} from '../../common/constants/permissions';
import { PERMISSION_QUERIES } from './dbQueries';
import { getUserPermissionAssignments } from '../../middleware/permissions';
import { getAllRoleDefaultPermissions, getRoleDefaultPermissions } from './rolePermissions.model';
import { EmployeeModel } from '../../employees/Employee';
import { UserRole } from '../../types';

// Every role except SUPER_ADMIN can have configurable defaults - SUPER_ADMIN
// bypasses tbl_user_permissions entirely (see PermissionGuard/RolesGuard), so
// a default grant for it would be dead data that could never take effect.
const ROLES_WITH_DEFAULTS: string[] = Object.values(UserRole).filter(
  (role) => role !== UserRole.SUPER_ADMIN,
);

@Injectable()
export class PermissionsService {
  getCatalog() {
    return PERMISSION_CATALOG;
  }

  // first_name/last_name/email are encrypted - the old raw SQL
  // (USER_QUERIES.SELECT_ALL_USERS_FOR_PERMISSIONS) can no longer select or
  // sort by them, so this goes through EmployeeModel (which already
  // decrypts) instead, remapped to the same flat snake_case shape the
  // frontend expects.
  async getManageableUsers() {
    const employees = await EmployeeModel.getAll();
    return employees
      .map((e) => ({ id: e.id, email: e.email, first_name: e.firstName, last_name: e.lastName, role: e.role }))
      .sort((a, b) => a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name));
  }

  async getMyPermissions(userId: number) {
    const assignments = await this.getAssignmentsFor(userId);
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

    const assignments = await this.getAssignmentsFor(userId, targetUser);
    return {
      userId,
      assignments,
      permissionLevels: this.toPermissionLevels(assignments),
      permissions: assignments.map((item) => item.key),
    };
  }

  // tbl_user_permissions is keyed by the business employee_id, not the
  // numeric tbl_employee.id used throughout this service's public API, so the
  // numeric id is resolved to employee_id before every read/write below.
  private async getAssignmentsFor(userId: number, preloadedUser?: Awaited<ReturnType<typeof EmployeeModel.findById>>) {
    const targetUser = preloadedUser ?? (await EmployeeModel.findById(userId));
    if (!targetUser?.employeeId) return [];
    return getUserPermissionAssignments(targetUser.employeeId);
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

  /** Every role's current default permission grants - the admin-editable
   * template applied to a user at creation and on every future role change
   * (see rolePermissions.model.ts). Roles with no rows yet (not customized
   * by an admin) simply come back with an empty array. */
  async getAllRoleDefaults() {
    const byRole = await getAllRoleDefaultPermissions();
    const roles = ROLES_WITH_DEFAULTS.map((role) => ({
      role,
      assignments: byRole[role] ?? [],
      permissionLevels: this.toPermissionLevels(byRole[role] ?? []),
    }));
    return { roles };
  }

  async getRoleDefaults(role: string) {
    this.assertConfigurableRole(role);
    const assignments = await getRoleDefaultPermissions(role);
    return { role, assignments, permissionLevels: this.toPermissionLevels(assignments) };
  }

  /** Replaces a role's default template (tbl_role_permissions), not any
   * already-created user's actual permissions - existing users keep whatever
   * they currently have until their role is changed or an admin edits them
   * individually via replaceUserPermissions. */
  async replaceRoleDefaults(actorId: number, role: string, rawPermissions: unknown[]) {
    this.assertConfigurableRole(role);
    const assignments = this.parseAndValidateAssignments(rawPermissions);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tbl_role_permissions WHERE role = $1', [role]);

      if (assignments.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        assignments.forEach((permission) => {
          const base = values.length;
          values.push(role, permission.key, permission.accessLevel, actorId);
          placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        });
        await client.query(
          `INSERT INTO tbl_role_permissions (role, permission_key, access_level, updated_by) VALUES ${placeholders.join(', ')}`,
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

    return { message: 'Role default permissions updated successfully', role, assignments };
  }

  private assertConfigurableRole(role: string) {
    if (!ROLES_WITH_DEFAULTS.includes(role)) {
      throw new BadRequestException(
        `Invalid role: ${role}. Super Admin bypasses the permission table entirely and has no configurable defaults.`,
      );
    }
  }

  private parseAndValidateAssignments(rawPermissions: unknown[]): PermissionAssignment[] {
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

    return assignments;
  }

  async replaceUserPermissions(actorId: number, userId: number, rawPermissions: unknown[]) {
    const targetUser = await EmployeeModel.findById(userId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const assignments = this.parseAndValidateAssignments(rawPermissions);

    if (!targetUser.employeeId) {
      throw new BadRequestException('User has no employee ID assigned');
    }
    const targetEmployeeId = targetUser.employeeId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tbl_user_permissions WHERE employee_id = $1', [targetEmployeeId]);

      if (assignments.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        assignments.forEach((permission) => {
          const base = values.length;
          values.push(targetEmployeeId, permission.key, permission.accessLevel, actorId);
          placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        });
        await client.query(
          `INSERT INTO tbl_user_permissions (employee_id, permission_key, access_level, assigned_by) VALUES ${placeholders.join(', ')}`,
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
