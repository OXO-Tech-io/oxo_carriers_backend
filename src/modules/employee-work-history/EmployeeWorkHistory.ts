import { db } from '../../db';
import { employeeWorkHistory, type EmployeeWorkHistory as DrizzleEmployeeWorkHistory } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type EmployeeWorkHistoryInput = {
  organization: string;
  positionHeld: string;
  employmentType?: 'regular' | 'intern' | 'trainee';
  startDate: string;
  endDate?: string | null;
  remarks?: string | null;
};

export class EmployeeWorkHistoryModel {
  static async listByEmployeeId(employeeId: string): Promise<DrizzleEmployeeWorkHistory[]> {
    return db.query.employeeWorkHistory.findMany({
      where: eq(employeeWorkHistory.employeeId, employeeId),
      orderBy: (t, { desc }) => [desc(t.startDate)],
    });
  }

  static async findById(id: number): Promise<DrizzleEmployeeWorkHistory | null> {
    const record = await db.query.employeeWorkHistory.findFirst({
      where: eq(employeeWorkHistory.id, id),
    });
    return record ?? null;
  }

  static async create(employeeId: string, data: EmployeeWorkHistoryInput): Promise<DrizzleEmployeeWorkHistory> {
    const [inserted] = await db
      .insert(employeeWorkHistory)
      .values({ employeeId, ...data })
      .returning();
    if (!inserted) throw new Error('Failed to create employee work history record');
    return inserted;
  }

  static async update(id: number, data: Partial<EmployeeWorkHistoryInput>): Promise<DrizzleEmployeeWorkHistory | null> {
    await db
      .update(employeeWorkHistory)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employeeWorkHistory.id, id));
    return this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    await db.delete(employeeWorkHistory).where(eq(employeeWorkHistory.id, id));
  }
}
