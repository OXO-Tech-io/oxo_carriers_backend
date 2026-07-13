import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EmployeeModel } from "../../src/models/User";
import { EmployeeWorkHistoryModel } from "../../src/models/EmployeeWorkHistory";
import { UserRole } from "../../src/types";

describe("EmployeeWorkHistoryModel", () => {
  let testUser: any = null;
  const testEmployeeId = "TEST_EMP_WH_999";
  const testEmail = "test_wh_user@example.com";

  beforeAll(async () => {
    const existing = await EmployeeModel.findByEmployeeId(testEmployeeId);
    if (existing) await EmployeeModel.delete(existing.id);

    testUser = await EmployeeModel.create({
      employee_id: testEmployeeId,
      email: testEmail,
      first_name: "Test",
      last_name: "WH User",
      role: UserRole.EMPLOYEE,
    });
  });

  afterAll(async () => {
    if (testUser) await EmployeeModel.delete(testUser.id);
  });

  it("creates, lists, updates, and deletes a work history record", async () => {
    const created = await EmployeeWorkHistoryModel.create(testUser.id, {
      organization: "Acme Corp",
      positionHeld: "Software Engineer",
      startDate: "2018-01-01",
      endDate: "2021-12-31",
      remarks: "Led backend team",
    });
    expect(created.userId).toBe(testUser.id);
    expect(created.organization).toBe("Acme Corp");

    const list = await EmployeeWorkHistoryModel.listByUserId(testUser.id);
    expect(list.some(r => r.id === created.id)).toBe(true);

    const updated = await EmployeeWorkHistoryModel.update(created.id, {
      positionHeld: "Senior Software Engineer",
    });
    expect(updated?.positionHeld).toBe("Senior Software Engineer");

    await EmployeeWorkHistoryModel.delete(created.id);
    const afterDelete = await EmployeeWorkHistoryModel.findById(created.id);
    expect(afterDelete).toBeNull();
  });

  it("supports a null endDate to represent 'Present'", async () => {
    const created = await EmployeeWorkHistoryModel.create(testUser.id, {
      organization: "Current Employer",
      positionHeld: "Lead Engineer",
      startDate: "2022-01-01",
      endDate: null,
    });
    expect(created.endDate).toBeNull();
    await EmployeeWorkHistoryModel.delete(created.id);
  });

  it("cascade deletes work history records when the employee is deleted", async () => {
    const created = await EmployeeWorkHistoryModel.create(testUser.id, {
      organization: "Beta Inc",
      positionHeld: "Consultant",
      startDate: "2015-01-01",
      endDate: "2016-01-01",
    });

    await EmployeeModel.delete(testUser.id);
    testUser = null;

    const afterDelete = await EmployeeWorkHistoryModel.findById(created.id);
    expect(afterDelete).toBeNull();
  });
});
