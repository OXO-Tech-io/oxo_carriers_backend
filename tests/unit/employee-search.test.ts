import { describe, it, expect, vi, beforeEach } from "vitest";

// OCD-524: exercises EmployeeModel.getAll's `search` filter directly - this
// is the query the recipient/employee pickers (e.g. GET /users?search=,
// consumed by UsersService.getAll) ultimately run against. firstName/
// lastName/email are encrypted at rest (non-deterministic ciphertext), so a
// SQL-level ILIKE can't match them - the filter has to run in application
// code after decrypting each row (see the OCD-451 comment in Employee.ts),
// which is also exactly what makes a naive single concatenated-string
// ILIKE-style substring test fail for a query typed in a different
// order/spacing than the stored concatenation. `decryptPII` is mocked as the
// identity function below so the fixture rows can just use plain text.
const findManyMock = vi.fn();

vi.mock("../../src/db", () => ({
  db: {
    query: {
      employee: {
        findMany: (...args: unknown[]) => findManyMock(...args),
      },
    },
  },
}));

vi.mock("../../src/db/schema", () => ({
  employee: {
    deletedAt: "deletedAt",
    role: "role",
    department: "department",
    createdAt: "createdAt",
  },
  userPermissions: {},
}));

vi.mock("../../src/utils/encryption", () => ({
  encryptPII: vi.fn((v: string) => v),
  decryptPII: vi.fn((v: string) => v),
  hashEmail: vi.fn((v: string) => v),
}));

vi.mock("../../src/modules/permissions/rolePermissions.model", () => ({
  getRoleDefaultPermissions: vi.fn(),
}));

import { EmployeeModel } from "../../src/employees/Employee";

const employees = [
  { id: 1, firstName: "John", lastName: "Smith", email: "john.smith@example.com", employeeId: "EMP1" },
  { id: 2, firstName: "Jane", lastName: "Doe", email: "jane.doe@example.com", employeeId: "EMP2" },
  { id: 3, firstName: "Mahen", lastName: "Jayalath", email: "mahen.j@example.com", employeeId: "EMP3" },
];

describe("EmployeeModel.getAll search filtering (OCD-524)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue(employees);
  });

  it("returns everyone when no search term is given", async () => {
    const result = await EmployeeModel.getAll();
    expect(result.map((e) => e.employeeId)).toEqual(["EMP1", "EMP2", "EMP3"]);
  });

  it("matches a single full name token", async () => {
    const result = await EmployeeModel.getAll({ search: "John" });
    expect(result.map((e) => e.employeeId)).toEqual(["EMP1"]);
  });

  it("matches a partial token", async () => {
    const result = await EmployeeModel.getAll({ search: "smi" });
    expect(result.map((e) => e.employeeId)).toEqual(["EMP1"]);
  });

  it("matches a multi-part query in first-then-last order", async () => {
    const result = await EmployeeModel.getAll({ search: "john smith" });
    expect(result.map((e) => e.employeeId)).toEqual(["EMP1"]);
  });

  it("matches a multi-part query in last-then-first order", async () => {
    const result = await EmployeeModel.getAll({ search: "smith john" });
    expect(result.map((e) => e.employeeId)).toEqual(["EMP1"]);
  });

  it("matches a multi-part query against a different employee, either order", async () => {
    expect((await EmployeeModel.getAll({ search: "mahen jayalath" })).map((e) => e.employeeId)).toEqual(["EMP3"]);
    expect((await EmployeeModel.getAll({ search: "jayalath mahen" })).map((e) => e.employeeId)).toEqual(["EMP3"]);
  });

  it("matches by email", async () => {
    const result = await EmployeeModel.getAll({ search: "jane.doe@example.com" });
    expect(result.map((e) => e.employeeId)).toEqual(["EMP2"]);
  });

  it("matches by a partial email token", async () => {
    const result = await EmployeeModel.getAll({ search: "jane.doe" });
    expect(result.map((e) => e.employeeId)).toEqual(["EMP2"]);
  });

  it("returns no results when a token doesn't match any employee", async () => {
    const result = await EmployeeModel.getAll({ search: "nonexistent" });
    expect(result).toEqual([]);
  });

  it("requires every token to match (AND, not OR)", async () => {
    // "john doe" has one token from EMP1 and one from EMP2 - neither
    // employee's combined searchable text contains both.
    const result = await EmployeeModel.getAll({ search: "john doe" });
    expect(result).toEqual([]);
  });
});
