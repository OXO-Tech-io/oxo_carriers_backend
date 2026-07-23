import { db } from '../db';
import { employeeNominees } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { pgpDecrypt, pgpEncrypt } from '../utils/pgpCrypto';

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export type EmployeeNomineeInput = {
  nameWithInitials?: string | null;
  nic?: string | null;
  relationship: string;
  proportionPercent: string | number;
};

export type DecryptedEmployeeNominee = {
  id: number;
  userId: number;
  nameWithInitials: string | null;
  nic: string | null;
  relationship: string;
  proportionPercent: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export class EmployeeNomineeModel {
  static async listByUserId(userId: number, executor: DbExecutor = db): Promise<DecryptedEmployeeNominee[]> {
    return executor
      .select({
        id: employeeNominees.id,
        userId: employeeNominees.userId,
        nameWithInitials: pgpDecrypt(employeeNominees.nameWithInitials),
        nic: pgpDecrypt(employeeNominees.nic),
        relationship: employeeNominees.relationship,
        proportionPercent: employeeNominees.proportionPercent,
        createdAt: employeeNominees.createdAt,
        updatedAt: employeeNominees.updatedAt,
      })
      .from(employeeNominees)
      .where(eq(employeeNominees.userId, userId));
  }

  static async countByUserId(userId: number, executor: DbExecutor = db): Promise<number> {
    const rows = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(employeeNominees)
      .where(eq(employeeNominees.userId, userId));
    return rows[0]?.count ?? 0;
  }

  static async create(userId: number, data: EmployeeNomineeInput, executor: DbExecutor = db) {
    const [inserted] = await executor
      .insert(employeeNominees)
      .values({
        userId,
        nameWithInitials: pgpEncrypt(data.nameWithInitials),
        nic: pgpEncrypt(data.nic),
        relationship: data.relationship,
        proportionPercent: String(data.proportionPercent),
      } as any)
      .returning({ id: employeeNominees.id });
    return inserted;
  }

  static async update(id: number, data: Partial<EmployeeNomineeInput>, executor: DbExecutor = db) {
    const values: any = { updatedAt: new Date() };
    if (data.nameWithInitials !== undefined) values.nameWithInitials = pgpEncrypt(data.nameWithInitials);
    if (data.nic !== undefined) values.nic = pgpEncrypt(data.nic);
    if (data.relationship !== undefined) values.relationship = data.relationship;
    if (data.proportionPercent !== undefined) values.proportionPercent = String(data.proportionPercent);
    await executor.update(employeeNominees).set(values).where(eq(employeeNominees.id, id));
  }

  static async delete(id: number, executor: DbExecutor = db): Promise<void> {
    await executor.delete(employeeNominees).where(eq(employeeNominees.id, id));
  }
}
