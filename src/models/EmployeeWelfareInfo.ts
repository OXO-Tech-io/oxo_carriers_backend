import { db } from '../db';
import { employeeWelfareInfo, type EmployeeWelfareInfo as DrizzleEmployeeWelfareInfo } from '../db/schema';
import { eq } from 'drizzle-orm';

type DbExecutor = Pick<typeof db, 'select' | 'insert'>;

export type EmployeeWelfareInfoInput = {
  weddingAnniversaryDate?: string | null;
  hobbies?: string | null;
  communityActivities?: string | null;
  professionalMemberships?: string | null;
};

// Plain columns only - none of Tab E's fields are identity/contact secrets,
// so unlike EmployeePiiModel/EmployeeNomineeModel/etc. there's no pgcrypto
// encrypt/decrypt step here.
export class EmployeeWelfareInfoModel {
  static async findByEmployeeId(
    employeeId: string,
    executor: DbExecutor = db
  ): Promise<DrizzleEmployeeWelfareInfo | null> {
    const rows = await executor
      .select()
      .from(employeeWelfareInfo)
      .where(eq(employeeWelfareInfo.employeeId, employeeId));
    return rows[0] ?? null;
  }

  static async upsert(employeeId: string, data: EmployeeWelfareInfoInput, executor: DbExecutor = db) {
    const values = { employeeId, ...data, updatedAt: new Date() };
    await executor
      .insert(employeeWelfareInfo)
      .values({ ...values, createdAt: new Date() })
      .onConflictDoUpdate({ target: employeeWelfareInfo.employeeId, set: values });
    return this.findByEmployeeId(employeeId, executor);
  }
}
