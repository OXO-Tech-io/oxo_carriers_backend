import { db } from '../db';
import { employeeDependents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { pgpDecrypt, pgpEncrypt } from '../utils/pgpCrypto';

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export type EmployeeDependentInput = {
  fullName?: string | null;
  nic?: string | null;
  dateOfBirth: string;
  gender: 'male' | 'female';
  relationship: 'spouse' | 'child';
  mobileNumber?: string | null;
};

export type DecryptedEmployeeDependent = {
  id: number;
  employeeId: string;
  fullName: string | null;
  nic: string | null;
  dateOfBirth: string;
  gender: 'male' | 'female';
  relationship: 'spouse' | 'child';
  mobileNumber: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export class EmployeeDependentModel {
  static async listByEmployeeId(employeeId: string, executor: DbExecutor = db): Promise<DecryptedEmployeeDependent[]> {
    return executor
      .select({
        id: employeeDependents.id,
        employeeId: employeeDependents.employeeId,
        fullName: pgpDecrypt(employeeDependents.fullName),
        nic: pgpDecrypt(employeeDependents.nic),
        dateOfBirth: employeeDependents.dateOfBirth,
        gender: employeeDependents.gender,
        relationship: employeeDependents.relationship,
        mobileNumber: pgpDecrypt(employeeDependents.mobileNumber),
        createdAt: employeeDependents.createdAt,
        updatedAt: employeeDependents.updatedAt,
      })
      .from(employeeDependents)
      .where(eq(employeeDependents.employeeId, employeeId));
  }

  static async create(employeeId: string, data: EmployeeDependentInput, executor: DbExecutor = db) {
    const [inserted] = await executor
      .insert(employeeDependents)
      .values({
        employeeId,
        fullName: pgpEncrypt(data.fullName),
        nic: pgpEncrypt(data.nic),
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        relationship: data.relationship,
        mobileNumber: pgpEncrypt(data.mobileNumber),
      } as any)
      .returning({ id: employeeDependents.id });
    return inserted;
  }

  static async update(id: number, data: Partial<EmployeeDependentInput>, executor: DbExecutor = db) {
    const values: any = { updatedAt: new Date() };
    if (data.fullName !== undefined) values.fullName = pgpEncrypt(data.fullName);
    if (data.nic !== undefined) values.nic = pgpEncrypt(data.nic);
    if (data.dateOfBirth !== undefined) values.dateOfBirth = data.dateOfBirth;
    if (data.gender !== undefined) values.gender = data.gender;
    if (data.relationship !== undefined) values.relationship = data.relationship;
    if (data.mobileNumber !== undefined) values.mobileNumber = pgpEncrypt(data.mobileNumber);
    await executor.update(employeeDependents).set(values).where(eq(employeeDependents.id, id));
  }

  static async delete(id: number, executor: DbExecutor = db): Promise<void> {
    await executor.delete(employeeDependents).where(eq(employeeDependents.id, id));
  }
}
