import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db";
import { UserModel } from "../../src/models/User";
import { EmployeePiiModel } from "../../src/models/EmployeePii";
import { employeePii } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { UserRole } from "../../src/types";

describe("Employee PII Encryption Integration Test", () => {
  let testUser: any = null;
  const testEmployeeId = "TEST_EMP_PII_999";
  const testEmail = "test_pii_user@example.com";

  beforeAll(async () => {
    // 1. Ensure any leftovers are cleaned up
    const existing = await UserModel.findByEmployeeId(testEmployeeId);
    if (existing) {
      await UserModel.delete(existing.id);
    }

    // 2. Create a test employee
    testUser = await UserModel.create({
      employee_id: testEmployeeId,
      email: testEmail,
      password: "TestPassword123!",
      first_name: "Test",
      last_name: "PII User",
      role: UserRole.EMPLOYEE,
      department: "Test Department",
      position: "Tester",
    });
  });

  afterAll(async () => {
    // Clean up
    if (testUser) {
      await UserModel.delete(testUser.id);
    }
  });

  it("should successfully encrypt and decrypt employee PII data using PGP symmetric encryption", async () => {
    const passportPlaintext = "AB1234567";
    const nationalIdPlaintext = "SSN-999-00-1111";
    const addressPlaintext = "123 Cryptography Lane, Secret City";
    const contactNamePlaintext = "John Doe";
    const contactPhonePlaintext = "+1-555-0199";

    // 1. Upsert PII details (internally uses pgp_sym_encrypt)
    const upserted = await EmployeePiiModel.upsert(testEmployeeId, {
      passportNumber: passportPlaintext,
      nationalId: nationalIdPlaintext,
      address: addressPlaintext,
      emergencyContactName: contactNamePlaintext,
      emergencyContactPhone: contactPhonePlaintext,
    });

    expect(upserted).not.toBeNull();
    expect(upserted!.employeeId).toBe(testEmployeeId);
    expect(upserted!.passportNumber).toBe(passportPlaintext);
    expect(upserted!.nationalId).toBe(nationalIdPlaintext);
    expect(upserted!.address).toBe(addressPlaintext);
    expect(upserted!.emergencyContactName).toBe(contactNamePlaintext);
    expect(upserted!.emergencyContactPhone).toBe(contactPhonePlaintext);

    // 2. Fetch directly from the database (raw table state) to prove it is ENCRYPTED
    const rawRecord = await db
      .select({
        passportNumber: employeePii.passportNumber,
        nationalId: employeePii.nationalId,
      })
      .from(employeePii)
      .where(eq(employeePii.employeeId, testEmployeeId))
      .then(rows => rows[0]);

    expect(rawRecord).toBeDefined();
    // Raw columns should be buffers (bytea)
    expect(Buffer.isBuffer(rawRecord.passportNumber)).toBe(true);
    expect(Buffer.isBuffer(rawRecord.nationalId)).toBe(true);
    
    // The buffer should not contain the plaintext values directly as text
    const rawPassportStr = rawRecord.passportNumber.toString("utf8");
    const rawNationalIdStr = rawRecord.nationalId.toString("utf8");
    expect(rawPassportStr).not.toContain(passportPlaintext);
    expect(rawNationalIdStr).not.toContain(nationalIdPlaintext);

    // 3. Retrieve using EmployeePiiModel.findByEmployeeId (internally uses pgp_sym_decrypt)
    const retrieved = await EmployeePiiModel.findByEmployeeId(testEmployeeId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.passportNumber).toBe(passportPlaintext);
    expect(retrieved!.nationalId).toBe(nationalIdPlaintext);
    expect(retrieved!.address).toBe(addressPlaintext);
    expect(retrieved!.emergencyContactName).toBe(contactNamePlaintext);
    expect(retrieved!.emergencyContactPhone).toBe(contactPhonePlaintext);

    // 4. Test partial update/upsert (keeps other fields)
    const updated = await EmployeePiiModel.upsert(testEmployeeId, {
      passportNumber: "NEW_PASSPORT_000",
    });
    expect(updated!.passportNumber).toBe("NEW_PASSPORT_000");
    expect(updated!.nationalId).toBe(nationalIdPlaintext); // unchanged
  });

  it("should cascade delete PII record when the employee is deleted", async () => {
    // Ensure the PII record exists first
    const piiBefore = await EmployeePiiModel.findByEmployeeId(testEmployeeId);
    expect(piiBefore).not.toBeNull();

    // Delete the employee
    await UserModel.delete(testUser.id);
    testUser = null; // Prevent afterAll from deleting again

    // Verify PII record is also deleted by cascade constraint
    const piiAfter = await EmployeePiiModel.findByEmployeeId(testEmployeeId);
    expect(piiAfter).toBeNull();
  });
});
