import { db } from '../db';
import { employeeEmergencyContacts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { pgpDecrypt, pgpEncrypt } from '../utils/pgpCrypto';

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export type EmployeeEmergencyContactInput = {
  name?: string | null;
  relationship: string;
  contactNumber?: string | null;
};

export type DecryptedEmployeeEmergencyContact = {
  id: number;
  employeeId: string;
  name: string | null;
  relationship: string;
  contactNumber: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export class EmployeeEmergencyContactModel {
  static async listByEmployeeId(
    employeeId: string,
    executor: DbExecutor = db
  ): Promise<DecryptedEmployeeEmergencyContact[]> {
    return executor
      .select({
        id: employeeEmergencyContacts.id,
        employeeId: employeeEmergencyContacts.employeeId,
        name: pgpDecrypt(employeeEmergencyContacts.name),
        relationship: employeeEmergencyContacts.relationship,
        contactNumber: pgpDecrypt(employeeEmergencyContacts.contactNumber),
        createdAt: employeeEmergencyContacts.createdAt,
        updatedAt: employeeEmergencyContacts.updatedAt,
      })
      .from(employeeEmergencyContacts)
      .where(eq(employeeEmergencyContacts.employeeId, employeeId));
  }

  static async create(employeeId: string, data: EmployeeEmergencyContactInput, executor: DbExecutor = db) {
    const [inserted] = await executor
      .insert(employeeEmergencyContacts)
      .values({
        employeeId,
        name: pgpEncrypt(data.name),
        relationship: data.relationship,
        contactNumber: pgpEncrypt(data.contactNumber),
      } as any)
      .returning({ id: employeeEmergencyContacts.id });
    return inserted;
  }

  static async update(id: number, data: Partial<EmployeeEmergencyContactInput>, executor: DbExecutor = db) {
    const values: any = { updatedAt: new Date() };
    if (data.name !== undefined) values.name = pgpEncrypt(data.name);
    if (data.relationship !== undefined) values.relationship = data.relationship;
    if (data.contactNumber !== undefined) values.contactNumber = pgpEncrypt(data.contactNumber);
    await executor.update(employeeEmergencyContacts).set(values).where(eq(employeeEmergencyContacts.id, id));
  }

  static async delete(id: number, executor: DbExecutor = db): Promise<void> {
    await executor.delete(employeeEmergencyContacts).where(eq(employeeEmergencyContacts.id, id));
  }
}
