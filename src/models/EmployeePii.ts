import { db } from '../db';
import { employeePii } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { env } from '../config/env';

export class EmployeePiiModel {
  private static getKey(): string {
    return env.PII_ENCRYPTION_KEY;
  }

  static async findByEmployeeId(employeeId: string) {
    const key = this.getKey();

    // Use SQL templates inside select to decrypt binary columns.
    // Wrap with COALESCE or CASE WHEN to handle potential nulls if needed,
    // though pgp_sym_decrypt(NULL, key) returns NULL in PostgreSQL.
    const results = await db
      .select({
        id: employeePii.id,
        employeeId: employeePii.employeeId,
        passportNumber: sql<string | null>`CASE WHEN ${employeePii.passportNumber} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.passportNumber}, ${key}) END`,
        nationalId: sql<string | null>`CASE WHEN ${employeePii.nationalId} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.nationalId}, ${key}) END`,
        address: sql<string | null>`CASE WHEN ${employeePii.address} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.address}, ${key}) END`,
        emergencyContactName: sql<string | null>`CASE WHEN ${employeePii.emergencyContactName} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.emergencyContactName}, ${key}) END`,
        emergencyContactPhone: sql<string | null>`CASE WHEN ${employeePii.emergencyContactPhone} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.emergencyContactPhone}, ${key}) END`,
        createdAt: employeePii.createdAt,
        updatedAt: employeePii.updatedAt,
      })
      .from(employeePii)
      .where(eq(employeePii.employeeId, employeeId));

    return results[0] || null;
  }

  static async upsert(
    employeeId: string,
    data: {
      passportNumber?: string | null;
      nationalId?: string | null;
      address?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
    }
  ) {
    const key = this.getKey();

    const valuesToInsert: any = {
      employeeId,
      updatedAt: new Date(),
    };

    if (data.passportNumber !== undefined) {
      valuesToInsert.passportNumber = data.passportNumber === null 
        ? null 
        : sql`pgp_sym_encrypt(${data.passportNumber}, ${key})`;
    }
    if (data.nationalId !== undefined) {
      valuesToInsert.nationalId = data.nationalId === null 
        ? null 
        : sql`pgp_sym_encrypt(${data.nationalId}, ${key})`;
    }
    if (data.address !== undefined) {
      valuesToInsert.address = data.address === null 
        ? null 
        : sql`pgp_sym_encrypt(${data.address}, ${key})`;
    }
    if (data.emergencyContactName !== undefined) {
      valuesToInsert.emergencyContactName = data.emergencyContactName === null 
        ? null 
        : sql`pgp_sym_encrypt(${data.emergencyContactName}, ${key})`;
    }
    if (data.emergencyContactPhone !== undefined) {
      valuesToInsert.emergencyContactPhone = data.emergencyContactPhone === null 
        ? null 
        : sql`pgp_sym_encrypt(${data.emergencyContactPhone}, ${key})`;
    }

    // Upsert using onConflictDoUpdate
    await db
      .insert(employeePii)
      .values({
        ...valuesToInsert,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: employeePii.employeeId,
        set: valuesToInsert,
      });

    return this.findByEmployeeId(employeeId);
  }

  static async delete(employeeId: string): Promise<void> {
    await db.delete(employeePii).where(eq(employeePii.employeeId, employeeId));
  }
}
