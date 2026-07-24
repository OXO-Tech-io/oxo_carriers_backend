import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db";
import { EmployeeModel } from "../../src/employees/Employee";
import { EmployeePiiModel } from "../../src/modules/employee-pii/EmployeePii";
import { employeePii, employee } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { UserRole } from "../../src/types";

describe("Employee PII Encryption Integration Test", () => {
  let testUser: any = null;
  const testEmployeeId = "TEST_EMP_PII_999";
  const testEmail = "test_pii_user@example.com";

  beforeAll(async () => {
    // 1. Ensure any leftovers are cleaned up
    const existing = await EmployeeModel.findByEmployeeId(testEmployeeId);
    if (existing) {
      await EmployeeModel.delete(existing.id);
    }

    // 2. Create a test employee
    testUser = await EmployeeModel.create({
      employee_id: testEmployeeId,
      email: testEmail,
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
      await EmployeeModel.delete(testUser.id);
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

  it("should successfully encrypt and decrypt user financial PII data (hourlyRate, bankName, accountNumber, etc.) in the users table", async () => {
    const hourlyRatePlain = 150.50;
    const bankNamePlain = "Chase Bank";
    const holderPlain = "Jane Doe";
    const accountPlain = "9876543210";
    const branchPlain = "Downtown Branch";
    const companyPlain = "Test Corp";
    const contactPlain = "+1-555-9999";

    // 1. Update the employee with financial PII details
    const updated = await EmployeeModel.update(testUser.id, {
      hourlyRate: String(hourlyRatePlain),
      bankName: bankNamePlain,
      accountHolderName: holderPlain,
      accountNumber: accountPlain,
      bankBranch: branchPlain,
      companyName: companyPlain,
      contactNumber: contactPlain,
    });

    expect(updated).not.toBeNull();
    expect(Number(updated!.hourlyRate)).toBe(hourlyRatePlain);
    expect(updated!.bankName).toBe(bankNamePlain);
    expect(updated!.accountNumber).toBe(accountPlain);

    // 2. Fetch directly from the database (raw table state) to prove it is ENCRYPTED
    const rawUser = await db
      .select({
        hourlyRate: employee.hourlyRate,
        bankName: employee.bankName,
        accountNumber: employee.accountNumber,
      })
      .from(employee)
      .where(eq(employee.id, testUser.id))
      .then(rows => rows[0]);

    expect(rawUser).toBeDefined();
    // Raw columns should contain the AES encrypted colon-separated structure
    expect(rawUser.hourlyRate).toContain(':');
    expect(rawUser.bankName).toContain(':');
    expect(rawUser.accountNumber).toContain(':');

    expect(rawUser.hourlyRate).not.toBe(String(hourlyRatePlain));
    expect(rawUser.bankName).not.toBe(bankNamePlain);
    expect(rawUser.accountNumber).not.toBe(accountPlain);

    // 3. Retrieve using EmployeeModel.findById to check auto-decryption
    const retrieved = await EmployeeModel.findById(testUser.id);
    expect(retrieved).not.toBeNull();
    expect(Number(retrieved!.hourlyRate)).toBe(hourlyRatePlain);
    expect(retrieved!.bankName).toBe(bankNamePlain);
    expect(retrieved!.accountHolderName).toBe(holderPlain);
    expect(retrieved!.accountNumber).toBe(accountPlain);
    expect(retrieved!.bankBranch).toBe(branchPlain);
    expect(retrieved!.companyName).toBe(companyPlain);
    expect(retrieved!.contactNumber).toBe(contactPlain);
  });

  it("should cascade delete PII record when the employee is deleted", async () => {
    // Ensure the PII record exists first
    const piiBefore = await EmployeePiiModel.findByEmployeeId(testEmployeeId);
    expect(piiBefore).not.toBeNull();

    // Delete the employee
    await EmployeeModel.delete(testUser.id);
    testUser = null; // Prevent afterAll from deleting again

    // Verify PII record is also deleted by cascade constraint
    const piiAfter = await EmployeePiiModel.findByEmployeeId(testEmployeeId);
    expect(piiAfter).toBeNull();
  });
});
