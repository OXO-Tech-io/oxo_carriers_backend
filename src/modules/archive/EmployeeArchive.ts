import { db } from '../../db';
import { employeeArchive, type EmployeeArchive as DrizzleEmployeeArchive } from '../../db/schema';
import { eq } from 'drizzle-orm';

export type EmployeeArchiveCreateInput = {
  employeeId: string;
  employeeNumericId: number | null;
  snapshot: unknown;
  deletedByEmployeeId: number | null;
  deletedByName: string | null;
};

export class EmployeeArchiveModel {
  static async create(data: EmployeeArchiveCreateInput): Promise<DrizzleEmployeeArchive> {
    const [inserted] = await db
      .insert(employeeArchive)
      .values({
        employeeId: data.employeeId,
        employeeNumericId: data.employeeNumericId,
        snapshot: data.snapshot as any,
        deletedAt: new Date(),
        deletedByEmployeeId: data.deletedByEmployeeId,
        deletedByName: data.deletedByName,
      })
      .returning();
    if (!inserted) throw new Error('Failed to create employee archive record');
    return inserted;
  }

  static async listAll(): Promise<DrizzleEmployeeArchive[]> {
    return db.query.employeeArchive.findMany({
      orderBy: (t, { desc }) => [desc(t.deletedAt)],
    });
  }

  static async findById(id: number): Promise<DrizzleEmployeeArchive | null> {
    const record = await db.query.employeeArchive.findFirst({
      where: eq(employeeArchive.id, id),
    });
    return record ?? null;
  }
}
