import { db } from '../db';
import { formDistributions, type FormDistribution as DrizzleFormDistribution } from '../db/schema';
import { and, eq } from 'drizzle-orm';

export class FormDistributionModel {
  static async createMany(formId: number, userIds: number[]): Promise<DrizzleFormDistribution[]> {
    if (!userIds.length) return [];
    return db
      .insert(formDistributions)
      .values(userIds.map((userId) => ({ formId, userId })))
      .returning();
  }

  static async listByFormId(formId: number): Promise<DrizzleFormDistribution[]> {
    return db.query.formDistributions.findMany({ where: eq(formDistributions.formId, formId) });
  }

  static async listByUserId(userId: number): Promise<DrizzleFormDistribution[]> {
    return db.query.formDistributions.findMany({ where: eq(formDistributions.userId, userId) });
  }

  static async isDistributedTo(formId: number, userId: number): Promise<boolean> {
    const record = await db.query.formDistributions.findFirst({
      where: and(eq(formDistributions.formId, formId), eq(formDistributions.userId, userId)),
    });
    return !!record;
  }
}
