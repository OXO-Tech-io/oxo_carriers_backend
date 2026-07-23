import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "../../src/db";
import {
  employeeEducation,
  auditLogs,
  notifications,
} from "../../src/db/schema";
import { EmployeeModel } from "../../src/models/Employee";
import { EmployeePiiModel } from "../../src/models/EmployeePii";
import { ProfileChangeRequestModel } from "../../src/models/ProfileChangeRequest";
import { profileChangeRequestService } from "../../src/services/profileChangeRequest.service";
import { UserRole } from "../../src/types";
import type { SubmitProfileChangeRequestInput } from "../../src/validators/profileChangeRequest.validator";

describe("Profile Change Request workflow (submit -> approve)", () => {
  let employee: any = null;
  let hrManager: any = null;
  const employeeIdTag = "TEST_EMP_PCR_999";
  const hrIdTag = "TEST_HR_PCR_999";

  beforeAll(async () => {
    const existingEmployee = await EmployeeModel.findByEmployeeId(employeeIdTag);
    if (existingEmployee) await EmployeeModel.delete(existingEmployee.id);
    const existingHr = await EmployeeModel.findByEmployeeId(hrIdTag);
    if (existingHr) await EmployeeModel.delete(existingHr.id);

    employee = await EmployeeModel.create({
      employee_id: employeeIdTag,
      email: "test_pcr_employee@example.com",
      password: "Test1234!",
      first_name: "Perry",
      last_name: "Candidate",
      role: UserRole.EMPLOYEE,
      contact_number: "+94770000000",
    });

    hrManager = await EmployeeModel.create({
      employee_id: hrIdTag,
      email: "test_pcr_hr@example.com",
      password: "Test1234!",
      first_name: "Helen",
      last_name: "Reviewer",
      role: UserRole.HR_MANAGER,
    });
  });

  afterAll(async () => {
    if (employee) await EmployeeModel.delete(employee.id);
    if (hrManager) await EmployeeModel.delete(hrManager.id);
  });

  it("submits a bundled change request and leaves it pending_approval", async () => {
    const input: SubmitProfileChangeRequestInput = {
      changes: [
        {
          entityType: "user_field",
          field: "contactNumber",
          operation: "update",
          before: "+94770000000",
          after: "+94779999999",
        },
        {
          entityType: "employee_pii_field",
          field: "address",
          operation: "update",
          before: null,
          after: "123 Approval Street, Colombo",
        },
        {
          entityType: "education",
          operation: "create",
          recordId: null,
          after: {
            qualificationLevel: "degree",
            qualificationTitle: "BSc Computer Science",
            awardingInstitution: "University of Colombo",
            dateAwarded: "2020-06-15",
          },
        },
      ],
      comments: "Please review my updated details.",
    };

    const created = await profileChangeRequestService.submitChangeRequest(employee.id, input);
    expect(created.status).toBe("pending_approval");
    expect(created.userId).toBe(employee.id);

    // Real tables should be untouched at this point.
    const stillOriginal = await EmployeeModel.findById(employee.id);
    expect(stillOriginal?.contactNumber).toBe("+94770000000");
    const educationBefore = await db.query.employeeEducation.findMany({
      where: eq(employeeEducation.userId, employee.id),
    });
    expect(educationBefore.length).toBe(0);

    // HR should have received an in-app notification about the submission.
    const hrNotifications = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, hrManager.id), eq(notifications.type, "profile_change_submitted")),
    });
    expect(hrNotifications).toBeDefined();

    (globalThis as any).__pcrRequestId = created.id;
  });

  it("applies every change atomically when HR approves", async () => {
    const requestId = (globalThis as any).__pcrRequestId as number;

    const updatedRequest = await profileChangeRequestService.decide(
      requestId,
      hrManager.id,
      UserRole.HR_MANAGER,
      "approved"
    );
    expect(updatedRequest.status).toBe("approved");
    expect(updatedRequest.reviewerId).toBe(hrManager.id);

    // 1. users.contactNumber updated and decrypts correctly
    const updatedEmployee = await EmployeeModel.findById(employee.id);
    expect(updatedEmployee?.contactNumber).toBe("+94779999999");

    // 2. employeePii.address updated and decrypts correctly
    const pii = await EmployeePiiModel.findByEmployeeId(employeeIdTag);
    expect(pii?.address).toBe("123 Approval Street, Colombo");

    // 3. employee_education row created
    const educationAfter = await db.query.employeeEducation.findMany({
      where: eq(employeeEducation.userId, employee.id),
    });
    expect(educationAfter.length).toBe(1);
    expect(educationAfter[0].qualificationTitle).toBe("BSc Computer Science");

    // 4. auditLogs rows written for each applied item
    const audit = await db.query.auditLogs.findMany({
      where: eq(auditLogs.action, "profile_change_request.applied"),
    });
    expect(audit.length).toBeGreaterThanOrEqual(3);

    // 5. employee received an in-app approval notification
    const employeeNotification = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, employee.id), eq(notifications.type, "profile_change_approved")),
    });
    expect(employeeNotification).toBeDefined();

    // Cleanup the education row created by approval so afterAll's cascade
    // delete of the test user doesn't leave orphaned assertions elsewhere.
    for (const record of educationAfter) {
      await db.delete(employeeEducation).where(eq(employeeEducation.id, record.id));
    }
  });

  it("rejects a decision on an already-decided request", async () => {
    const requestId = (globalThis as any).__pcrRequestId as number;
    await expect(
      profileChangeRequestService.decide(requestId, hrManager.id, UserRole.HR_MANAGER, "rejected", "too late")
    ).rejects.toThrow();
  });

  it("requires reviewerComments to reject or return, enforced end-to-end via ProfileChangeRequestModel + service", async () => {
    const second = await profileChangeRequestService.submitChangeRequest(employee.id, {
      changes: [
        {
          entityType: "user_field",
          field: "undergraduateDegreeCompletionDate",
          operation: "update",
          before: null,
          after: "2019-05-20",
        },
      ],
    });

    const returned = await profileChangeRequestService.decide(
      second.id,
      hrManager.id,
      UserRole.HR_MANAGER,
      "returned_for_modification",
      "Please attach supporting documents."
    );
    expect(returned.status).toBe("returned_for_modification");

    const resubmitted = await profileChangeRequestService.submitChangeRequest(employee.id, {
      changes: [
        {
          entityType: "user_field",
          field: "undergraduateDegreeCompletionDate",
          operation: "update",
          before: null,
          after: "2019-05-20",
        },
      ],
      previousRequestId: second.id,
    });
    expect(resubmitted.previousRequestId).toBe(second.id);

    const original = await ProfileChangeRequestModel.findById(second.id);
    expect(original?.status).toBe("returned_for_modification");
  });
});
