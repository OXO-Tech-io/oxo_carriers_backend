import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole } from "../../src/types";

const { findById, transaction, getAll } = vi.hoisted(() => ({
  findById: vi.fn(),
  transaction: vi.fn(),
  getAll: vi.fn(),
}));

vi.mock("../../src/db", () => ({ db: { transaction, query: {}, insert: vi.fn() } }));
vi.mock("../../src/modules/profile-change-requests/ProfileChangeRequest", () => ({
  ProfileChangeRequestModel: { findById },
}));
vi.mock("../../src/employees/Employee", () => ({ EmployeeModel: { getAll, findById: vi.fn() } }));

import { profileChangeRequestService } from "../../src/modules/profile-change-requests/profileChangeRequest.service";

const pending = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  employeeId: "EMP1",
  status: "pending_approval",
  approvalStage: "hr_manager",
  submittedByRole: UserRole.EMPLOYEE,
  changes: [],
  ...overrides,
});

describe("profileChangeRequestService.decide approval stages (OCD-603/604/605)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockResolvedValue([]);
  });

  it("forbids anyone but the HR Manager from deciding at the HR Manager stage", async () => {
    findById.mockResolvedValue(pending());
    await expect(profileChangeRequestService.decide(1, 3, UserRole.SUPER_ADMIN, "approved")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("forbids the HR Manager from deciding once the request awaits the Administrator", async () => {
    findById.mockResolvedValue(pending({ approvalStage: "admin" }));
    await expect(profileChangeRequestService.decide(1, 2, UserRole.HR_MANAGER, "approved")).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      profileChangeRequestService.decide(1, 2, UserRole.HR_MANAGER, "rejected", "no"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("forbids HR Executive and employees from deciding at any stage", async () => {
    findById.mockResolvedValue(pending());
    await expect(profileChangeRequestService.decide(1, 4, UserRole.HR_EXECUTIVE, "approved")).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(profileChangeRequestService.decide(1, 5, UserRole.EMPLOYEE, "approved")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("hands an HR Manager approval to the Administrator without applying the changes", async () => {
    findById.mockResolvedValue(pending());
    const updated = { id: 1, status: "pending_approval", approvalStage: "admin" };
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const set = vi.fn().mockReturnValue({ where: vi.fn() });
      const tx = {
        update: vi.fn().mockReturnValue({ set }),
        insert: vi.fn().mockReturnValue({ values: vi.fn() }),
        query: { profileChangeRequests: { findFirst: vi.fn().mockResolvedValue(updated) } },
      };
      const result = await fn(tx);
      // First update is the stage hand-off: stage -> admin, no `status` change.
      expect(set.mock.calls[0][0]).toMatchObject({ approvalStage: "admin", hrManagerReviewerId: 2 });
      expect(set.mock.calls[0][0]).not.toHaveProperty("status");
      return result;
    });
    getAll.mockResolvedValue([{ employeeId: "ADM1" }]);

    const result = await profileChangeRequestService.decide(1, 2, UserRole.HR_MANAGER, "approved", "ok");
    expect(result).toBe(updated);
    expect(getAll).toHaveBeenCalledWith({ role: [UserRole.SUPER_ADMIN] });
  });

  it("rejects a request that was already decided", async () => {
    findById.mockResolvedValue(pending({ status: "approved", approvalStage: null }));
    await expect(profileChangeRequestService.decide(1, 3, UserRole.SUPER_ADMIN, "approved")).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
