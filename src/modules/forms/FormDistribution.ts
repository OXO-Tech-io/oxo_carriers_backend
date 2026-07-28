import { db } from '../../db';
import { formDistributions, type FormDistribution as DrizzleFormDistribution } from '../../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { EmployeeModel } from '../../employees/Employee';

export class FormDistributionModel {
  // `userIds` here are the numeric tbl_employee.id values used throughout the
  // Forms API/DTOs; tbl_form_distributions itself stores the business
  // employee_id (varchar) FK, so each numeric id is resolved via
  // EmployeeModel before being persisted/queried.
  //
  // Idempotent: an employee already distributed this form (e.g. HR clicks
  // Distribute again, or re-distributes to an overlapping recipient set) is
  // silently skipped rather than getting a second row - which previously
  // caused the form to appear duplicated in that employee's My Forms list
  // and fired a duplicate assignment notification/email every time.
  static async createMany(formId: number, userIds: number[]): Promise<DrizzleFormDistribution[]> {
    if (!userIds.length) return [];
    const employees = await Promise.all(userIds.map((userId) => EmployeeModel.findById(userId)));
    const employeeIds = employees
      .filter((emp): emp is NonNullable<typeof emp> => !!emp?.employeeId)
      .map((emp) => emp.employeeId as string);
    if (!employeeIds.length) return [];

    const existing = await db.query.formDistributions.findMany({
      where: and(eq(formDistributions.formId, formId), inArray(formDistributions.employeeId, employeeIds)),
    });
    const alreadyDistributed = new Set(existing.map((d) => d.employeeId));
    const values = employeeIds.filter((id) => !alreadyDistributed.has(id)).map((employeeId) => ({ formId, employeeId }));
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
