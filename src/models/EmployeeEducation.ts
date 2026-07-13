import { db } from '../db';
import { employeeEducation, type EmployeeEducation as DrizzleEmployeeEducation } from '../db/schema';
import { eq } from 'drizzle-orm';

export type EmployeeEducationInput = {
  qualificationLevel: DrizzleEmployeeEducation['qualificationLevel'];
  qualificationTitle: string;
  awardingInstitution: string;
  dateAwarded?: string | null;
  remarks?: string | null;
};

export class EmployeeEducationModel {
  static async listByUserId(userId: number): Promise<DrizzleEmployeeEducation[]> {
    return db.query.employeeEducation.findMany({
      where: eq(employeeEducation.userId, userId),
      orderBy: (t, { desc }) => [desc(t.dateAwarded)],
    });
  }

  static async findById(id: number): Promise<DrizzleEmployeeEducation | null> {
    const record = await db.query.employeeEducation.findFirst({
      where: eq(employeeEducation.id, id),
    });
    return record ?? null;
  }

  static async create(userId: number, data: EmployeeEducationInput): Promise<DrizzleEmployeeEducation> {
    const [inserted] = await db
      .insert(employeeEducation)
      .values({ userId, ...data })
      .returning();
    if (!inserted) throw new Error('Failed to create employee education record');
    return inserted;
  }

  static async update(id: number, data: Partial<EmployeeEducationInput>): Promise<DrizzleEmployeeEducation | null> {
    await db
      .update(employeeEducation)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employeeEducation.id, id));
    return this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    await db.delete(employeeEducation).where(eq(employeeEducation.id, id));
  }
}
