import { db } from '../../db';
import { formDistributions, type FormDistribution as DrizzleFormDistribution } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { EmployeeModel } from '../../employees/Employee';

export class FormDistributionModel {
  // `userIds` here are the numeric tbl_employee.id values used throughout the
  // Forms API/DTOs; tbl_form_distributions itself stores the business
  // employee_id (varchar) FK, so each numeric id is resolved via
  // EmployeeModel before being persisted/queried.
  static async createMany(formId: number, userIds: number[]): Promise<DrizzleFormDistribution[]> {
    if (!userIds.length) return [];
    const employees = await Promise.all(userIds.map((userId) => EmployeeModel.findById(userId)));
    const values = employees
      .filter((emp): emp is NonNullable<typeof emp> => !!emp?.employeeId)
      .map((emp) => ({ formId, employeeId: emp.employeeId as string }));
    if (!values.length) return [];
    return db.insert(formDistributions).values(values).returning();
  }

  static async listByFormId(formId: number): Promise<DrizzleFormDistribution[]> {
    return db.query.formDistributions.findMany({ where: eq(formDistributions.formId, formId) });
  }

  static async listByUserId(userId: number): Promise<DrizzleFormDistribution[]> {
    const employee = await EmployeeModel.findById(userId);
    if (!employee?.employeeId) return [];
    return db.query.formDistributions.findMany({ where: eq(formDistributions.employeeId, employee.employeeId) });
  }

  static async isDistributedTo(formId: number, userId: number): Promise<boolean> {
    const employee = await EmployeeModel.findById(userId);
    if (!employee?.employeeId) return false;
    const record = await db.query.formDistributions.findFirst({
      where: and(eq(formDistributions.formId, formId), eq(formDistributions.employeeId, employee.employeeId)),
    });
    return !!record;
  }
}
