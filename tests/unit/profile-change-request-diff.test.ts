import { describe, it, expect } from "vitest";
import {
  profileChangeItemSchema,
  submitProfileChangeRequestSchema,
  decideProfileChangeRequestSchema,
} from "../../src/validators/profileChangeRequest.validator";

describe("profileChangeRequest.validator", () => {
  it("accepts a valid user_field (contactNumber) change item", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "user_field",
      field: "contactNumber",
      operation: "update",
      before: "+94771234567",
      after: "+94779999999",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid composite bank_account change item", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "user_field",
      field: "bank_account",
      operation: "update",
      before: { bankName: "Old Bank", accountHolderName: "A", accountNumber: "1", bankBranch: "B" },
      after: { bankName: "New Bank", accountHolderName: "A", accountNumber: "2", bankBranch: "C" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bank_account item whose before/after aren't bank account objects", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "user_field",
      field: "bank_account",
      operation: "update",
      before: "not-an-object",
      after: "still-not-an-object",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid employee_pii_field (address) change item", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "address",
      operation: "update",
      before: null,
      after: "123 Main Street, Colombo",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid education create item", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "create",
      recordId: null,
      after: {
        qualificationLevel: "degree",
        qualificationTitle: "BSc Computer Science",
        awardingInstitution: "University of Colombo",
        dateAwarded: "2020-06-15",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an education create item that includes a recordId", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "create",
      recordId: 5,
      after: {
        qualificationLevel: "degree",
        qualificationTitle: "BSc Computer Science",
        awardingInstitution: "University of Colombo",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an education delete item missing recordId/before", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "delete",
      recordId: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid work_history update item", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "work_history",
      operation: "update",
      recordId: 3,
      before: { organization: "Old Co", positionHeld: "Analyst", startDate: "2018-01-01", endDate: "2020-01-01" },
      after: { organization: "Old Co", positionHeld: "Senior Analyst", startDate: "2018-01-01", endDate: "2020-01-01" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a work_history record where endDate is before startDate", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "work_history",
      operation: "create",
      recordId: null,
      after: { organization: "Co", positionHeld: "Role", startDate: "2020-01-01", endDate: "2019-01-01" },
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one change in a submission bundle", () => {
    const result = submitProfileChangeRequestSchema.safeParse({ changes: [] });
    expect(result.success).toBe(false);
  });

  it("allows an approval decision without reviewerComments", () => {
    const result = decideProfileChangeRequestSchema.safeParse({ decision: "approved" });
    expect(result.success).toBe(true);
  });

  it("requires reviewerComments when rejecting", () => {
    const result = decideProfileChangeRequestSchema.safeParse({ decision: "rejected" });
    expect(result.success).toBe(false);
  });

  it("requires reviewerComments when returning for modification", () => {
    const result = decideProfileChangeRequestSchema.safeParse({
      decision: "returned_for_modification",
      reviewerComments: "Please update the address format.",
    });
    expect(result.success).toBe(true);
  });
});
