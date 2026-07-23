import { db } from '../db';
import {
  groups,
  groupMembers,
  users,
  type Group as DrizzleGroup,
  type GroupMember as DrizzleGroupMember,
} from '../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

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

  static async listMembers(groupId: number): Promise<GroupMemberWithUser[]> {
    return db
      .select({
        id: groupMembers.id,
        userId: groupMembers.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        addedAt: groupMembers.addedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(users.firstName);
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

  static async addMembers(groupId: number, userIds: number[], addedBy: number): Promise<DrizzleGroupMember[]> {
    if (!userIds.length) return [];
    return db
      .insert(groupMembers)
      .values(userIds.map((userId) => ({ groupId, userId, addedBy })))
      .onConflictDoNothing()
      .returning();
  }

  static async removeMember(groupId: number, userId: number): Promise<void> {
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  }

  /** Flat, deduped user IDs across every given group - the integration point Communications/Forms use to resolve group recipients. */
  static async getMemberUserIds(groupIds: number[]): Promise<number[]> {
    if (!groupIds.length) return [];
    const rows = await db
      .selectDistinct({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(inArray(groupMembers.groupId, groupIds));
    return rows.map((r) => r.userId);
  }
}
