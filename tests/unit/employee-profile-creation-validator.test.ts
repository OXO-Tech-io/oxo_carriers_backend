import { describe, it, expect } from "vitest";
import { createEmployeeProfileSchema } from "../../src/validators/employeeProfileCreation.validator";

const baseStatutory = {
  // OCD-416: nationalId is now validated against real Sri Lankan NIC formats
  // (9 digits + V/X, or 12 digits) - the old "NIC12345" placeholder no
  // longer parses.
  nationalId: "199012345678",
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

  // OCD-472: the old 2-nominee cap is removed - any number of nominees is
  // allowed, as long as their proportions sum to exactly 100%.
  it("accepts more than 2 nominees when their proportions sum to 100%", () => {
    const nominee = (proportionPercent: number) => ({
      nameWithInitials: "J. Nominee",
      nic: "199012345678",
      relationship: "spouse",
      proportionPercent,
    });
    const result = createEmployeeProfileSchema.safeParse({
      nominees: [nominee(40), nominee(30), nominee(30)],
    });
    expect(result.success).toBe(true);
  });

  // OCD-428: cumulative proportion must equal exactly 100%.
  it("rejects nominees whose proportions don't sum to 100%", () => {
    const nominee = {
      nameWithInitials: "J. Nominee",
      nic: "199012345678",
      relationship: "spouse",
      proportionPercent: 50,
    };
    const result = createEmployeeProfileSchema.safeParse({
      nominees: [nominee, nominee, nominee],
    });
    expect(result.success).toBe(false);
  });

  // OCD-471: at least one nominee is required once the key is provided.
  it("rejects an empty nominees array", () => {
    const result = createEmployeeProfileSchema.safeParse({ nominees: [] });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 2 valid nominees summing to 100%", () => {
    const nominee = {
      nameWithInitials: "J. Nominee",
      nic: "199012345678",
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
