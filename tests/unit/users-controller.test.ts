import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole } from "../../src/types";
import { UsersController } from "../../src/modules/users/users.controller";

const createUsersServiceMock = () => ({
  getAll: vi.fn(),
  getDepartments: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  provisionKeycloak: vi.fn(),
  update: vi.fn(),
  updateRole: vi.fn(),
  resetPassword: vi.fn(),
  delete: vi.fn(),
});

const employee = { userId: 1, employeeId: "EMP1", role: UserRole.HR_MANAGER } as any;

describe("UsersController", () => {
  let service: ReturnType<typeof createUsersServiceMock>;
  let controller: UsersController;

  beforeEach(() => {
    service = createUsersServiceMock();
    controller = new UsersController(service as any);
  });

  it("getAll wraps the service result in a success envelope", async () => {
    service.getAll.mockResolvedValue([{ email: "a@b.com" }]);
    const result = await controller.getAll("term");
    expect(service.getAll).toHaveBeenCalledWith("term");
    expect(result).toEqual({ success: true, users: [{ email: "a@b.com" }] });
  });

  it("getDepartments wraps the service result", async () => {
    service.getDepartments.mockResolvedValue(["HR", "Finance"]);
    const result = await controller.getDepartments();
    expect(result).toEqual({ success: true, departments: ["HR", "Finance"] });
  });

  it("getById returns the user and personalDetails", async () => {
    service.getById.mockResolvedValue({ user: { id: 1 }, personalDetails: { address: "x" } });
    const result = await controller.getById(1, employee);
    expect(result).toEqual({ success: true, user: { id: 1 }, personalDetails: { address: "x" } });
  });

  describe("create", () => {
    it("returns the 'provisioning skipped' message when keycloak wasn't provisioned", async () => {
      service.create.mockResolvedValue({ id: 1, keycloak: { provisioned: false } });
      const result = await controller.create({} as any, employee);
      expect(result.message).toContain("Keycloak provisioning failed");
    });

    it("returns the onboarding-email-sent message when provisioned successfully", async () => {
      service.create.mockResolvedValue({ id: 1, keycloak: { provisioned: true, onboardingEmailSent: true } });
      const result = await controller.create({} as any, employee);
      expect(result.message).toContain("An onboarding email has been sent");
    });

    it("returns the email-failed message when provisioned but the email failed", async () => {
      service.create.mockResolvedValue({ id: 1, keycloak: { provisioned: true, onboardingEmailSent: false } });
      const result = await controller.create({} as any, employee);
      expect(result.message).toContain("could not be sent");
    });
  });

  describe("provisionKeycloak", () => {
    it("returns the already-provisioned message", async () => {
      service.provisionKeycloak.mockResolvedValue({ alreadyProvisioned: true, keycloakSub: "kc-1" });
      const result = await controller.provisionKeycloak(1);
      expect(result).toEqual({
        success: true,
        message: "User is already provisioned in Keycloak.",
        keycloakSub: "kc-1",
      });
    });

    it("returns the onboarding-sent message on fresh provisioning", async () => {
      service.provisionKeycloak.mockResolvedValue({
        alreadyProvisioned: false,
        keycloakSub: "kc-2",
        onboardingEmailSent: true,
      });
      const result = await controller.provisionKeycloak(2);
      expect(result.message).toContain("An onboarding email has been sent");
    });
  });

  it("update wraps the service result", async () => {
    service.update.mockResolvedValue({ id: 1, firstName: "New" });
    const result = await controller.update(1, {} as any, employee);
    expect(result).toEqual({ success: true, message: "User updated successfully", user: { id: 1, firstName: "New" } });
  });

  it("updateRole reports the previous and new role in the message", async () => {
    service.updateRole.mockResolvedValue({ id: 1, previous_role: "employee", new_role: "hr_manager" });
    const result = await controller.updateRole(1, { role: UserRole.HR_MANAGER } as any, employee);
    expect(result.message).toBe("Role updated from 'employee' to 'hr_manager'");
  });

  it("resetPassword returns a success envelope when the email sends", async () => {
    service.resetPassword.mockResolvedValue({ emailSent: true });
    const result = await controller.resetPassword(1, employee);
    expect(result).toEqual({
      success: true,
      message: "Password has been reset. An email with the new temporary password has been sent to the user.",
    });
  });

  it("resetPassword reports the email failure when it fails", async () => {
    service.resetPassword.mockResolvedValue({ emailSent: false, emailErrorReason: "smtp down" });
    const result = await controller.resetPassword(1, employee);
    expect(result.message).toContain("smtp down");
  });

  it("delete returns a success envelope", async () => {
    service.delete.mockResolvedValue(undefined);
    const result = await controller.delete(1, employee);
    expect(result).toEqual({ success: true, message: "User deleted successfully" });
  });
});
