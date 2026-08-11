import { describe, it, expect } from "vitest";
import { createEmployeeProfileSchema } from "../../src/validators/employeeProfileCreation.validator";

const baseStatutory = {
  nationalId: "NIC12345",
  legalName: "Jane Full Name",
  initialsName: "J.F. Name",
  addressLine1: "123 Main St",
  city: "Colombo",
  district: "Colombo",
  dateOfBirth: "1990-01-01",
  birthPlace: "Colombo",
  sex: "female",
  maritalStatus: "single",
  nationality: "Sri Lankan",
  motherName: "Mother Name",
  fatherName: "Father Name",
};

describe("employeeProfileCreation.validator", () => {
  it("accepts an empty payload (all top-level sections optional)", () => {
    const result = createEmployeeProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a full valid payload with statutory info", () => {
    const result = createEmployeeProfileSchema.safeParse({
      statutory: baseStatutory,
      bloodType: "O+",
    });
    expect(result.success).toBe(true);
  });

  it("rejects statutory info missing a required field", () => {
    const { nationalId, ...rest } = baseStatutory;
    const result = createEmployeeProfileSchema.safeParse({ statutory: rest });
    expect(result.success).toBe(false);
  });

  it("rejects more than 2 nominees", () => {
    const nominee = {
      nameWithInitials: "J. Nominee",
      nic: "NIC999",
      relationship: "spouse",
      proportionPercent: 50,
    };
    const result = createEmployeeProfileSchema.safeParse({
      nominees: [nominee, nominee, nominee],
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 2 valid nominees", () => {
    const nominee = {
      nameWithInitials: "J. Nominee",
      nic: "NIC999",
      relationship: "spouse",
      proportionPercent: 50,
    };
    const result = createEmployeeProfileSchema.safeParse({
      nominees: [nominee, nominee],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid bloodType enum value", () => {
    const result = createEmployeeProfileSchema.safeParse({ bloodType: "invalid" });
    expect(result.success).toBe(false);
  });

  it("accepts remittance and welfare sections independently", () => {
    const result = createEmployeeProfileSchema.safeParse({
      remittance: { residingCity: "Kandy" },
      welfare: { hobbies: "Reading" },
    });
    expect(result.success).toBe(true);
  });
});
