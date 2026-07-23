import { db } from '../db';
import {
  groups,
  groupMembers,
  employee as users,
  type Group as DrizzleGroup,
  type GroupMember as DrizzleGroupMember,
} from '../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { EmployeeModel } from './Employee';

export type GroupWithMemberCount = DrizzleGroup & { memberCount: number };

export interface GroupMemberWithUser {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  addedAt: Date | null;
}

export class GroupModel {
  static async create(name: string, createdBy: number): Promise<DrizzleGroup> {
    const [inserted] = await db.insert(groups).values({ name, createdBy }).returning();
    if (!inserted) throw new Error('Failed to create group');
    return inserted;
  }

  static async findById(id: number): Promise<DrizzleGroup | null> {
    const record = await db.query.groups.findFirst({ where: eq(groups.id, id) });
    return record ?? null;
  }

  static async findByName(name: string): Promise<DrizzleGroup | null> {
    const record = await db.query.groups.findFirst({ where: sql`lower(${groups.name}) = lower(${name})` });
    return record ?? null;
  }

  static async listAll(): Promise<GroupWithMemberCount[]> {
    return db
      .select({
        id: groups.id,
        name: groups.name,
        createdBy: groups.createdBy,
        createdAt: groups.createdAt,
        updatedAt: groups.updatedAt,
        memberCount: sql<number>`count(${groupMembers.id})::int`,
      })
      .from(groups)
      .leftJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .groupBy(groups.id)
      .orderBy(groups.name);
  }

  // tbl_group_members stores the business employee_id (varchar) FK, but the
  // API/DTOs surface the numeric tbl_employee.id everywhere else, so the
  // join resolves back to `users.id` here to keep that contract unchanged.
  // firstName/lastName/email are encrypted - can't be selected or sorted in
  // SQL, so only non-PII columns are selected here; names are batch-resolved
  // and the final order applied in application code below.
  static async listMembers(groupId: number): Promise<GroupMemberWithUser[]> {
    const rows = await db
      .select({
        id: groupMembers.id,
        userId: users.id,
        employeeId: users.employeeId,
        role: users.role,
        addedAt: groupMembers.addedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.employeeId, users.employeeId))
      .where(eq(groupMembers.groupId, groupId));

    const employeeMap = await EmployeeModel.findByEmployeeIds(rows.map((r) => r.employeeId).filter((id): id is string => !!id));
    const withNames = rows.map((row) => {
      const emp = row.employeeId ? employeeMap.get(row.employeeId) : undefined;
      return {
        id: row.id,
        userId: row.userId,
        firstName: emp?.firstName ?? '',
        lastName: emp?.lastName ?? '',
        email: emp?.email ?? '',
        role: row.role,
        addedAt: row.addedAt,
      };
    });
    withNames.sort((a, b) => a.firstName.localeCompare(b.firstName));
    return withNames;
  }

  static async rename(id: number, name: string): Promise<DrizzleGroup | null> {
    const [updated] = await db
      .update(groups)
      .set({ name, updatedAt: new Date() })
      .where(eq(groups.id, id))
      .returning();
    return updated ?? null;
  }

  static async delete(id: number): Promise<void> {
    await db.delete(groups).where(eq(groups.id, id));
  }

  // `userIds` are numeric tbl_employee.id values (matching AddGroupMembersDto);
  // each is resolved to its business employee_id before being persisted.
  static async addMembers(groupId: number, userIds: number[], addedBy: number): Promise<DrizzleGroupMember[]> {
    if (!userIds.length) return [];
    const employees = await Promise.all(userIds.map((userId) => EmployeeModel.findById(userId)));
    const values = employees
      .filter((emp): emp is NonNullable<typeof emp> => !!emp?.employeeId)
      .map((emp) => ({ groupId, employeeId: emp.employeeId as string, addedBy }));
    if (!values.length) return [];
    return db.insert(groupMembers).values(values).onConflictDoNothing().returning();
  }

  static async removeMember(groupId: number, userId: number): Promise<void> {
    const employee = await EmployeeModel.findById(userId);
    if (!employee?.employeeId) return;
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.employeeId, employee.employeeId)));
  }

  /** Flat, deduped user IDs across every given group - the integration point Communications/Forms use to resolve group recipients. */
  static async getMemberUserIds(groupIds: number[]): Promise<number[]> {
    if (!groupIds.length) return [];
    const rows = await db
      .selectDistinct({ userId: users.id })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.employeeId, users.employeeId))
      .where(inArray(groupMembers.groupId, groupIds));
    return rows.map((r) => r.userId);
  }
}
