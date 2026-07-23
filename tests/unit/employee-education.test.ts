import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EmployeeModel } from "../../src/models/Employee";
import { EmployeeEducationModel } from "../../src/models/EmployeeEducation";
import { UserRole } from "../../src/types";

describe("EmployeeEducationModel", () => {
  let testUser: any = null;
  const testEmployeeId = "TEST_EMP_EDU_999";
  const testEmail = "test_edu_user@example.com";

  beforeAll(async () => {
    const existing = await EmployeeModel.findByEmployeeId(testEmployeeId);
    if (existing) await EmployeeModel.delete(existing.id);

    testUser = await EmployeeModel.create({
      employee_id: testEmployeeId,
      email: testEmail,
      password: "Test1234!",
      first_name: "Test",
      last_name: "Edu User",
      role: UserRole.EMPLOYEE,
    });
  });

  afterAll(async () => {
    if (testUser) await EmployeeModel.delete(testUser.id);
  });

  it("creates, lists, updates, and deletes an education record", async () => {
    const created = await EmployeeEducationModel.create(testUser.id, {
      qualificationLevel: "degree",
      qualificationTitle: "BSc Computer Science",
      awardingInstitution: "University of Colombo",
      dateAwarded: "2020-06-15",
      remarks: "First class honours",
    });
    expect(created.userId).toBe(testUser.id);
    expect(created.qualificationLevel).toBe("degree");

    const list = await EmployeeEducationModel.listByUserId(testUser.id);
    expect(list.some(r => r.id === created.id)).toBe(true);

    const updated = await EmployeeEducationModel.update(created.id, {
      qualificationTitle: "BSc Computer Science (Hons)",
    });
    expect(updated?.qualificationTitle).toBe("BSc Computer Science (Hons)");

    await EmployeeEducationModel.delete(created.id);
    const afterDelete = await EmployeeEducationModel.findById(created.id);
    expect(afterDelete).toBeNull();
  });

  it("cascade deletes education records when the employee is deleted", async () => {
    const created = await EmployeeEducationModel.create(testUser.id, {
      qualificationLevel: "masters",
      qualificationTitle: "MSc Data Science",
      awardingInstitution: "University of Moratuwa",
    });

    await EmployeeModel.delete(testUser.id);
    testUser = null;

    const afterDelete = await EmployeeEducationModel.findById(created.id);
    expect(afterDelete).toBeNull();
  });
});
