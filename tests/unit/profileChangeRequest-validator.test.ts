import { describe, it, expect } from "vitest";
import {
  bankAccountValueSchema,
  addressValueSchema,
  emergencyContactValueSchema,
  nomineeValueSchema,
  dependentValueSchema,
  emergencyContactRecordValueSchema,
  profileChangeItemSchema,
  submitProfileChangeRequestSchema,
  decideProfileChangeRequestSchema,
  listProfileChangeRequestsQuerySchema,
  profileChangeRequestIdParamSchema,
} from "../../src/validators/profileChangeRequest.validator";

// ──────────────────────────────────────────────────────────────────────────────
// bankAccountValueSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("bankAccountValueSchema", () => {
  it("accepts a fully-populated bank account", () => {
    const result = bankAccountValueSchema.safeParse({
      bankName: "Bank of Ceylon",
      accountHolderName: "Jane Doe",
      accountNumber: "123456789",
      bankBranch: "Colombo",
      bankBranchCode: "001",
      swiftCode: "BCEYLKLX",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null values for all nullable fields", () => {
    const result = bankAccountValueSchema.safeParse({
      bankName: null,
      accountHolderName: null,
      accountNumber: null,
      bankBranch: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing required key (bankName)", () => {
    const result = bankAccountValueSchema.safeParse({
      accountHolderName: "Jane",
      accountNumber: "123",
      bankBranch: "Colombo",
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// addressValueSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("addressValueSchema", () => {
  const validAddress = {
    addressLine1: "12 Main St",
    addressLine2: null,
    city: "Colombo",
    district: "Western",
  };

  it("accepts a valid address", () => {
    expect(addressValueSchema.safeParse(validAddress).success).toBe(true);
  });

  it("rejects an empty addressLine1", () => {
    expect(addressValueSchema.safeParse({ ...validAddress, addressLine1: "" }).success).toBe(false);
  });

  it("rejects an empty city", () => {
    expect(addressValueSchema.safeParse({ ...validAddress, city: "" }).success).toBe(false);
  });

  it("rejects an empty district", () => {
    expect(addressValueSchema.safeParse({ ...validAddress, district: "" }).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// emergencyContactValueSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("emergencyContactValueSchema", () => {
  it("accepts a valid emergency contact", () => {
    const result = emergencyContactValueSchema.safeParse({
      emergencyContactName: "John Doe",
      emergencyContactPhone: "+94771234567",
      emergencyContactRelationship: "Spouse",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty emergencyContactName", () => {
    expect(
      emergencyContactValueSchema.safeParse({
        emergencyContactName: "",
        emergencyContactPhone: "+94771234567",
        emergencyContactRelationship: null,
      }).success
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// nomineeValueSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("nomineeValueSchema", () => {
  it("accepts a valid nominee", () => {
    const result = nomineeValueSchema.safeParse({
      nameWithInitials: "J. Doe",
      nic: "199012345678",
      relationship: "Spouse",
      proportionPercent: 50,
    });
    expect(result.success).toBe(true);
  });

  it("coerces proportionPercent from a string", () => {
    const result = nomineeValueSchema.safeParse({
      nameWithInitials: "J. Doe",
      nic: "199012345678",
      relationship: "Spouse",
      proportionPercent: "100",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.proportionPercent).toBe(100);
  });

  it("rejects proportionPercent > 100", () => {
    expect(
      nomineeValueSchema.safeParse({
        nameWithInitials: "J. Doe",
        nic: "123",
        relationship: "Spouse",
        proportionPercent: 101,
      }).success
    ).toBe(false);
  });

  it("rejects a missing nic", () => {
    expect(
      nomineeValueSchema.safeParse({
        nameWithInitials: "J. Doe",
        relationship: "Spouse",
        proportionPercent: 50,
      }).success
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// dependentValueSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("dependentValueSchema", () => {
  const validDependent = {
    fullName: "Child One",
    dateOfBirth: "2010-05-20",
    gender: "female",
    relationship: "child",
  };

  it("accepts a valid dependent", () => {
    expect(dependentValueSchema.safeParse(validDependent).success).toBe(true);
  });

  it("rejects an invalid gender", () => {
    expect(dependentValueSchema.safeParse({ ...validDependent, gender: "other" }).success).toBe(false);
  });

  it("rejects an invalid relationship", () => {
    expect(dependentValueSchema.safeParse({ ...validDependent, relationship: "sibling" }).success).toBe(false);
  });

  it("rejects a malformed dateOfBirth", () => {
    expect(dependentValueSchema.safeParse({ ...validDependent, dateOfBirth: "20-05-2010" }).success).toBe(false);
  });

  it("rejects an empty fullName", () => {
    expect(dependentValueSchema.safeParse({ ...validDependent, fullName: "" }).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// emergencyContactRecordValueSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("emergencyContactRecordValueSchema", () => {
  it("accepts a valid emergency contact record", () => {
    const result = emergencyContactRecordValueSchema.safeParse({
      name: "Alice",
      relationship: "Sister",
      contactNumber: "+94712345678",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      emergencyContactRecordValueSchema.safeParse({
        name: "",
        relationship: "Sister",
        contactNumber: "+94712345678",
      }).success
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// profileChangeItemSchema — user_field entity
// ──────────────────────────────────────────────────────────────────────────────
describe("profileChangeItemSchema — user_field", () => {
  it("accepts a scalar contactNumber update", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "user_field",
      field: "contactNumber",
      operation: "update",
      before: "+94771234567",
      after: "+94779876543",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a bank_account update with valid bank objects", () => {
    const bank = {
      bankName: "People's Bank",
      accountHolderName: "Jane",
      accountNumber: "00112233",
      bankBranch: "Kandy",
    };
    const result = profileChangeItemSchema.safeParse({
      entityType: "user_field",
      field: "bank_account",
      operation: "update",
      before: bank,
      after: { ...bank, accountNumber: "99887766" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bank_account update when after is a plain string", () => {
    const bank = {
      bankName: "People's Bank",
      accountHolderName: "Jane",
      accountNumber: "00112233",
      bankBranch: "Kandy",
    };
    const result = profileChangeItemSchema.safeParse({
      entityType: "user_field",
      field: "bank_account",
      operation: "update",
      before: bank,
      after: "not-a-bank-object",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown field for user_field", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "user_field",
      field: "unknownField",
      operation: "update",
      before: null,
      after: "value",
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// profileChangeItemSchema — employee_pii_field entity
// ──────────────────────────────────────────────────────────────────────────────
describe("profileChangeItemSchema — employee_pii_field", () => {
  it("accepts an address update with valid address objects", () => {
    const addr = { addressLine1: "1 Temple Rd", addressLine2: null, city: "Kandy", district: "Central" };
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "address",
      operation: "update",
      before: addr,
      after: { ...addr, city: "Gampola" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a blood_type update with valid enum values", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "blood_type",
      operation: "update",
      before: null,
      after: "O+",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blood_type update with an invalid value", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "blood_type",
      operation: "update",
      before: null,
      after: "X+",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a date_of_birth update with a valid ISO date", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "date_of_birth",
      operation: "update",
      before: null,
      after: "1990-07-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a date_of_birth update with a malformed date", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "date_of_birth",
      operation: "update",
      before: null,
      after: "15/07/1990",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a residing_address update where after is null (same as permanent)", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "residing_address",
      operation: "update",
      before: null,
      after: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a sex update with valid enum value", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "sex",
      operation: "update",
      before: null,
      after: "female",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a sex update with an invalid value", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "employee_pii_field",
      field: "sex",
      operation: "update",
      before: null,
      after: "nonbinary",
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// profileChangeItemSchema — education record operations
// ──────────────────────────────────────────────────────────────────────────────
describe("profileChangeItemSchema — education", () => {
  const educationRecord = {
    qualificationLevel: "degree",
    qualificationTitle: "BSc Computer Science",
    awardingInstitution: "University of Colombo",
    dateAwarded: "2020-06-15",
  };

  it("accepts a create operation (null recordId, after present)", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "create",
      recordId: null,
      after: educationRecord,
    });
    expect(result.success).toBe(true);
  });

  it("rejects create when recordId is not null", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "create",
      recordId: 5,
      after: educationRecord,
    });
    expect(result.success).toBe(false);
  });

  it("rejects create when after is missing", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "create",
      recordId: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an update operation with recordId, before, and after", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "update",
      recordId: 3,
      before: educationRecord,
      after: { ...educationRecord, qualificationTitle: "BSc (Hons)" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects update when recordId is null", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "update",
      recordId: null,
      before: educationRecord,
      after: educationRecord,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a delete operation with recordId and before", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "education",
      operation: "delete",
      recordId: 3,
      before: educationRecord,
    });
    expect(result.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// profileChangeItemSchema — welfare_field entity
// ──────────────────────────────────────────────────────────────────────────────
describe("profileChangeItemSchema — welfare_field", () => {
  it("accepts a hobbies update", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "welfare_field",
      field: "hobbies",
      operation: "update",
      before: null,
      after: "Reading, Hiking",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown welfare field", () => {
    const result = profileChangeItemSchema.safeParse({
      entityType: "welfare_field",
      field: "unknown_field",
      operation: "update",
      before: null,
      after: "value",
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// submitProfileChangeRequestSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("submitProfileChangeRequestSchema", () => {
  const validChange = {
    entityType: "welfare_field",
    field: "hobbies",
    operation: "update",
    before: null,
    after: "Reading",
  };

  it("accepts a minimal valid submission", () => {
    const result = submitProfileChangeRequestSchema.safeParse({ changes: [validChange] });
    expect(result.success).toBe(true);
  });

  it("accepts an optional comments field", () => {
    const result = submitProfileChangeRequestSchema.safeParse({
      changes: [validChange],
      comments: "Updating my hobby list",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optional previousRequestId that is coerced from string", () => {
    const result = submitProfileChangeRequestSchema.safeParse({
      changes: [validChange],
      previousRequestId: "7",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.previousRequestId).toBe(7);
  });

  it("rejects an empty changes array", () => {
    const result = submitProfileChangeRequestSchema.safeParse({ changes: [] });
    expect(result.success).toBe(false);
  });

  it("rejects comments exceeding 2000 characters", () => {
    const result = submitProfileChangeRequestSchema.safeParse({
      changes: [validChange],
      comments: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// decideProfileChangeRequestSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("decideProfileChangeRequestSchema", () => {
  it("accepts an approval without reviewerComments", () => {
    const result = decideProfileChangeRequestSchema.safeParse({ decision: "approved" });
    expect(result.success).toBe(true);
  });

  it("accepts a rejection with reviewerComments", () => {
    const result = decideProfileChangeRequestSchema.safeParse({
      decision: "rejected",
      reviewerComments: "Does not meet policy requirements",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a rejection without reviewerComments", () => {
    const result = decideProfileChangeRequestSchema.safeParse({ decision: "rejected" });
    expect(result.success).toBe(false);
  });

  it("rejects returned_for_modification without reviewerComments", () => {
    const result = decideProfileChangeRequestSchema.safeParse({
      decision: "returned_for_modification",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown decision value", () => {
    const result = decideProfileChangeRequestSchema.safeParse({ decision: "pending" });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// listProfileChangeRequestsQuerySchema
// ──────────────────────────────────────────────────────────────────────────────
describe("listProfileChangeRequestsQuerySchema", () => {
  it("accepts an empty query (both fields optional)", () => {
    expect(listProfileChangeRequestsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid status filter", () => {
    const result = listProfileChangeRequestsQuerySchema.safeParse({ status: "pending_approval" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status value", () => {
    expect(listProfileChangeRequestsQuerySchema.safeParse({ status: "unknown_status" }).success).toBe(false);
  });

  it("coerces userId from a string", () => {
    const result = listProfileChangeRequestsQuerySchema.safeParse({ userId: "12" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.userId).toBe(12);
  });

  it("rejects a non-positive userId", () => {
    expect(listProfileChangeRequestsQuerySchema.safeParse({ userId: "0" }).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// profileChangeRequestIdParamSchema
// ──────────────────────────────────────────────────────────────────────────────
describe("profileChangeRequestIdParamSchema", () => {
  it("coerces a positive integer string id", () => {
    const result = profileChangeRequestIdParamSchema.safeParse({ id: "42" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(42);
  });

  it("rejects a non-positive id", () => {
    expect(profileChangeRequestIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(profileChangeRequestIdParamSchema.safeParse({ id: "-1" }).success).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(profileChangeRequestIdParamSchema.safeParse({}).success).toBe(false);
  });
});
