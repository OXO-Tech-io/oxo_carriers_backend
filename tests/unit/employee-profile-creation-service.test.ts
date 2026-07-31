import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeTx = { __tx: true };

vi.mock("../../src/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => callback(fakeTx)),
  },
}));
vi.mock("../../src/employees/EmployeePii", () => ({
  EmployeePiiModel: { upsert: vi.fn() },
}));
vi.mock("../../src/modules/employee-nominees/EmployeeNominee", () => ({
  EmployeeNomineeModel: { create: vi.fn() },
}));
vi.mock("../../src/modules/employee-dependents/EmployeeDependent", () => ({
  EmployeeDependentModel: { create: vi.fn() },
}));
vi.mock("../../src/modules/employee-emergency-contacts/EmployeeEmergencyContact", () => ({
  EmployeeEmergencyContactModel: { create: vi.fn() },
}));
vi.mock("../../src/modules/employee-welfare-info/EmployeeWelfareInfo", () => ({
  EmployeeWelfareInfoModel: { upsert: vi.fn() },
}));

import { EmployeePiiModel } from "../../src/employees/EmployeePii";
import { EmployeeNomineeModel } from "../../src/modules/employee-nominees/EmployeeNominee";
import { EmployeeDependentModel } from "../../src/modules/employee-dependents/EmployeeDependent";
import { EmployeeEmergencyContactModel } from "../../src/modules/employee-emergency-contacts/EmployeeEmergencyContact";
import { EmployeeWelfareInfoModel } from "../../src/modules/employee-welfare-info/EmployeeWelfareInfo";
import { employeeProfileCreationService } from "../../src/modules/users/employeeProfileCreation.service";

const piiUpsertMock = EmployeePiiModel.upsert as unknown as ReturnType<typeof vi.fn>;
const nomineeCreateMock = EmployeeNomineeModel.create as unknown as ReturnType<typeof vi.fn>;
const dependentCreateMock = EmployeeDependentModel.create as unknown as ReturnType<typeof vi.fn>;
const emergencyContactCreateMock = EmployeeEmergencyContactModel.create as unknown as ReturnType<typeof vi.fn>;
const welfareUpsertMock = EmployeeWelfareInfoModel.upsert as unknown as ReturnType<typeof vi.fn>;

const user = { id: 1, employeeId: "EMP1" };

describe("employeeProfileCreationService.applyToNewEmployee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing beyond the transaction wrapper for an empty profile", async () => {
    await employeeProfileCreationService.applyToNewEmployee(user, {});
    expect(piiUpsertMock).not.toHaveBeenCalled();
    expect(nomineeCreateMock).not.toHaveBeenCalled();
    expect(welfareUpsertMock).not.toHaveBeenCalled();
  });

  it("upserts PII when statutory info is present, within the transaction", async () => {
    await employeeProfileCreationService.applyToNewEmployee(user, {
      statutory: {
        nationalId: "NIC1",
        legalName: "Jane Doe",
        initialsName: "J. Doe",
        addressLine1: "123 St",
        city: "Colombo",
        district: "Colombo",
        dateOfBirth: "1990-01-01",
        birthPlace: "Colombo",
        sex: "female",
        maritalStatus: "single",
        nationality: "Sri Lankan",
        motherName: "Mother",
        fatherName: "Father",
      },
    } as any);
    expect(piiUpsertMock).toHaveBeenCalledWith(
      "EMP1",
      expect.objectContaining({ nationalId: "NIC1", legalName: "Jane Doe" }),
      fakeTx,
    );
  });

  it("upserts PII with remittance/bloodType fields even without statutory", async () => {
    await employeeProfileCreationService.applyToNewEmployee(user, {
      bloodType: "O+",
      remittance: { residingCity: "Kandy" },
    } as any);
    expect(piiUpsertMock).toHaveBeenCalledWith(
      "EMP1",
      expect.objectContaining({ bloodType: "O+", residingCity: "Kandy" }),
      fakeTx,
    );
  });

  it("creates a row per nominee", async () => {
    const nominees = [
      { nameWithInitials: "A", nic: "1", relationship: "spouse", proportionPercent: 50 },
      { nameWithInitials: "B", nic: "2", relationship: "child", proportionPercent: 50 },
    ];
    await employeeProfileCreationService.applyToNewEmployee(user, { nominees } as any);
    expect(nomineeCreateMock).toHaveBeenCalledTimes(2);
    expect(nomineeCreateMock).toHaveBeenNthCalledWith(1, "EMP1", nominees[0], fakeTx);
  });

  it("creates dependents only when marital status is married", async () => {
    const dependents = [{ fullName: "Kid", dateOfBirth: "2020-01-01", gender: "male", relationship: "child" }];
    await employeeProfileCreationService.applyToNewEmployee(user, {
      statutory: { maritalStatus: "single" } as any,
      dependents,
    } as any);
    expect(dependentCreateMock).not.toHaveBeenCalled();

    await employeeProfileCreationService.applyToNewEmployee(user, {
      statutory: { maritalStatus: "married" } as any,
      dependents,
    } as any);
    expect(dependentCreateMock).toHaveBeenCalledWith("EMP1", dependents[0], fakeTx);
  });

  it("creates a row per emergency contact regardless of marital status", async () => {
    const contacts = [{ name: "Contact", relationship: "friend", phoneNumber: "123" }];
    await employeeProfileCreationService.applyToNewEmployee(user, { emergencyContacts: contacts } as any);
    expect(emergencyContactCreateMock).toHaveBeenCalledWith("EMP1", contacts[0], fakeTx);
  });

  it("upserts welfare info when provided", async () => {
    const welfare = { hobbies: "Reading" };
    await employeeProfileCreationService.applyToNewEmployee(user, { welfare } as any);
    expect(welfareUpsertMock).toHaveBeenCalledWith("EMP1", welfare, fakeTx);
  });
});
