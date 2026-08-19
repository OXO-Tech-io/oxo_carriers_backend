import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { UserRole, EmployeeStatus } from "../../src/types";

vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: {
    getAll: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByEmployeeId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    generateEmployeeId: vi.fn(),
    linkKeycloakSub: vi.fn(),
  },
}));
vi.mock("../../src/employees/EmployeePii", () => ({
  EmployeePiiModel: { findByEmployeeId: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../src/config/database", () => ({
  default: { query: vi.fn() },
}));
vi.mock("../../src/modules/users/keycloakAdmin.service", () => ({
  keycloakAdminService: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updatePassword: vi.fn(),
    deleteUser: vi.fn(),
  },
}));
vi.mock("../../src/utils/password", () => ({
  generateSecureTemporaryPassword: vi.fn().mockReturnValue("Temp1234!@#"),
}));
vi.mock("../../src/modules/users/employeeProfileCreation.service", () => ({
  employeeProfileCreationService: { applyToNewEmployee: vi.fn() },
}));
vi.mock("../../src/config/email", () => ({
  sendWelcomeCredentialsEmail: vi.fn(),
  sendPasswordResetCredentialsEmail: vi.fn(),
}));
vi.mock("../../src/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { EmployeeModel } from "../../src/employees/Employee";
import { EmployeePiiModel } from "../../src/employees/EmployeePii";
import pool from "../../src/config/database";
import { keycloakAdminService } from "../../src/modules/users/keycloakAdmin.service";
import { employeeProfileCreationService } from "../../src/modules/users/employeeProfileCreation.service";
import { sendWelcomeCredentialsEmail, sendPasswordResetCredentialsEmail } from "../../src/config/email";
import { UsersService } from "../../src/modules/users/users.service";

const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const piiFindMock = EmployeePiiModel.findByEmployeeId as unknown as ReturnType<typeof vi.fn>;
const piiDeleteMock = EmployeePiiModel.delete as unknown as ReturnType<typeof vi.fn>;
const poolQueryMock = (pool as any).query as ReturnType<typeof vi.fn>;
const kc = keycloakAdminService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const applyToNewEmployeeMock = employeeProfileCreationService.applyToNewEmployee as unknown as ReturnType<
  typeof vi.fn
>;
const sendWelcomeCredentialsEmailMock = sendWelcomeCredentialsEmail as unknown as ReturnType<typeof vi.fn>;
const sendPasswordResetCredentialsEmailMock = sendPasswordResetCredentialsEmail as unknown as ReturnType<typeof vi.fn>;

const hr = { userId: 1, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;
const superAdmin = { userId: 2, employeeId: "SA1", role: UserRole.SUPER_ADMIN } as any;
const selfEmployee = { userId: 5, employeeId: "EMP5", role: UserRole.EMPLOYEE } as any;

describe("UsersService", () => {
  let service: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsersService();
    poolQueryMock.mockResolvedValue({ rows: [] });
  });

  describe("getAll", () => {
    it("merges keycloak accounts with local employees by email", async () => {
      kc.listUsers.mockResolvedValue([
        { id: "kc-1", email: "a@b.com", firstName: "KCFirst", enabled: true, emailVerified: true, requiredActions: [] },
      ]);
      em.getAll.mockResolvedValue([{ email: "A@B.com", firstName: "DBFirst", lastName: "Last" }]);

      const result = await service.getAll("search");
      expect(result).toEqual([
        {
          keycloakId: "kc-1",
          email: "A@B.com",
          firstName: "KCFirst",
          lastName: "Last",
          enabled: true,
          emailVerified: true,
          requiredActions: [],
          employee: { email: "A@B.com", firstName: "DBFirst", lastName: "Last" },
        },
      ]);
    });

    it("still returns employees with no matching keycloak account", async () => {
      kc.listUsers.mockResolvedValue([]);
      em.getAll.mockResolvedValue([{ email: "nokey@b.com", firstName: "F", lastName: "L" }]);
      const result = await service.getAll();
      expect(result[0].keycloakId).toBeNull();
      expect(result[0].enabled).toBeNull();
    });
  });

  describe("getById", () => {
    it("throws ForbiddenException when a self-only role requests another user", async () => {
      await expect(service.getById(999, selfEmployee)).rejects.toThrow(ForbiddenException);
    });

    it("throws NotFoundException when the user doesn't exist", async () => {
      em.findById.mockResolvedValue(null);
      await expect(service.getById(1, hr)).rejects.toThrow(NotFoundException);
    });

    it("returns the user and personal details when found", async () => {
      em.findById.mockResolvedValue({ id: 1, employeeId: "EMP1" });
      piiFindMock.mockResolvedValue({ address: "123 St" });
      const result = await service.getById(1, hr);
      expect(result).toEqual({ user: { id: 1, employeeId: "EMP1" }, personalDetails: { address: "123 St" } });
    });

    it("returns null personalDetails when the user has no employeeId yet", async () => {
      em.findById.mockResolvedValue({ id: 1, employeeId: null });
      const result = await service.getById(1, hr);
      expect(result.personalDetails).toBeNull();
      expect(piiFindMock).not.toHaveBeenCalled();
    });

    it("allows a self-only role to fetch their own record", async () => {
      em.findById.mockResolvedValue({ id: 5, employeeId: "EMP5" });
      const result = await service.getById(5, selfEmployee);
      expect(result.user).toEqual({ id: 5, employeeId: "EMP5" });
    });
  });

  describe("create", () => {
    const baseDto = { email: "new@b.com", first_name: "New", last_name: "User" } as any;

    it("rejects roles that cannot create users", async () => {
      await expect(service.create(baseDto, selfEmployee)).rejects.toThrow(ForbiddenException);
    });

    it("rejects creating a service_provider directly", async () => {
      await expect(service.create({ ...baseDto, role: UserRole.SERVICE_PROVIDER }, hr)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects missing required fields", async () => {
      await expect(service.create({ email: "a@b.com" } as any, hr)).rejects.toThrow(BadRequestException);
    });

    it("requires an hourly rate for the consultant role", async () => {
      await expect(service.create({ ...baseDto, role: UserRole.CONSULTANT }, hr)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects an invalid profile payload", async () => {
      await expect(
        service.create({ ...baseDto, profile: { bloodType: "invalid" } }, hr),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects dependents when marital status isn't married", async () => {
      await expect(
        service.create(
          {
            ...baseDto,
            profile: {
              statutory: { maritalStatus: "single" },
              dependents: [{ fullName: "Kid", dateOfBirth: "2020-01-01", gender: "male", relationship: "child" }],
            },
          },
          hr,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when the email is already registered", async () => {
      em.findByEmail.mockResolvedValue({ id: 1 });
      await expect(service.create(baseDto, hr)).rejects.toThrow(ConflictException);
    });

    it("rejects when the given employee_id is already registered", async () => {
      em.findByEmail.mockResolvedValue(null);
      em.findByEmployeeId.mockResolvedValue({ id: 1 });
      await expect(service.create({ ...baseDto, employee_id: "EMP1" }, hr)).rejects.toThrow(ConflictException);
    });

    it("creates an employee, seeds leave balances/permissions, and auto-provisions keycloak", async () => {
      em.findByEmail.mockResolvedValue(null);
      em.generateEmployeeId.mockResolvedValue("EMP100");
      em.create.mockResolvedValue({ id: 10, employeeId: "EMP100", email: baseDto.email, hireDate: null });
      poolQueryMock.mockImplementation((query: string) => {
        if (query.includes("tbl_leave_types")) {
          return Promise.resolve({ rows: [{ id: 1, name: "Annual", max_days: 14 }] });
        }
        return Promise.resolve({ rows: [] });
      });
      em.findById.mockResolvedValue({ id: 10, employeeId: "EMP100", email: baseDto.email, keycloakSub: null });
      kc.createUser.mockResolvedValue("kc-sub-1");
      sendWelcomeCredentialsEmailMock.mockResolvedValue({ success: true });

      const result = await service.create(baseDto, hr);

      expect(em.create).toHaveBeenCalled();
      // employee_id (business id), not the dropped user_id column / numeric
      // internal id - see renameUserIdToEmployeeIdFk.ts.
      expect(poolQueryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tbl_employee_leave_balance (employee_id"),
        ["EMP100", 1, expect.any(Number), expect.any(Number), expect.any(Number)],
      );
      expect(poolQueryMock).toHaveBeenCalledWith(expect.stringContaining("tbl_user_permissions"), expect.any(Array));
      expect(result.keycloak).toEqual({ provisioned: true, onboardingEmailSent: true });
    });

    it("skips keycloak provisioning when a super admin opts out", async () => {
      em.findByEmail.mockResolvedValue(null);
      em.generateEmployeeId.mockResolvedValue("EMP101");
      em.create.mockResolvedValue({ id: 11, employeeId: "EMP101", email: baseDto.email, hireDate: null });

      const result = await service.create({ ...baseDto, skipKeycloakProvisioning: true }, superAdmin);
      expect(result.keycloak).toEqual({ provisioned: false });
      expect(kc.createUser).not.toHaveBeenCalled();
    });

    it("applies a valid profile via employeeProfileCreationService", async () => {
      em.findByEmail.mockResolvedValue(null);
      em.generateEmployeeId.mockResolvedValue("EMP102");
      em.create.mockResolvedValue({ id: 12, employeeId: "EMP102", email: baseDto.email, hireDate: null });

      await service.create(
        { ...baseDto, role: UserRole.HR_EXECUTIVE, skipKeycloakProvisioning: false, profile: { bloodType: "O+" } },
        superAdmin,
      );
      expect(applyToNewEmployeeMock).toHaveBeenCalledWith(
        { id: 12, employeeId: "EMP102" },
        expect.objectContaining({ bloodType: "O+" }),
      );
    });

    it("does not fail user creation when keycloak provisioning throws", async () => {
      em.findByEmail.mockResolvedValue(null);
      em.generateEmployeeId.mockResolvedValue("EMP103");
      em.create.mockResolvedValue({ id: 13, employeeId: "EMP103", email: baseDto.email, hireDate: null });
      em.findById.mockResolvedValue({ id: 13, employeeId: "EMP103", email: baseDto.email, keycloakSub: null });
      kc.createUser.mockRejectedValue(new Error("kc down"));

      const result = await service.create(baseDto, hr);
      expect(result.keycloak).toEqual({ provisioned: false, error: "kc down" });
    });

    it("rejects an HR manager creating a super_admin", async () => {
      em.findByEmail.mockResolvedValue(null);
      await expect(service.create({ ...baseDto, role: UserRole.SUPER_ADMIN }, hr)).rejects.toThrow(
        ForbiddenException,
      );
      expect(em.create).not.toHaveBeenCalled();
    });

    it("allows a super admin to create another super_admin", async () => {
      em.findByEmail.mockResolvedValue(null);
      em.generateEmployeeId.mockResolvedValue("EMP104");
      em.create.mockResolvedValue({ id: 14, employeeId: "EMP104", email: baseDto.email, hireDate: null });

      await service.create({ ...baseDto, role: UserRole.SUPER_ADMIN }, superAdmin);
      expect(em.create).toHaveBeenCalledWith(expect.objectContaining({ role: UserRole.SUPER_ADMIN }));
    });
  });

  describe("update", () => {
    it("throws ForbiddenException when a self-only role updates another user", async () => {
      await expect(service.update(999, {} as any, selfEmployee)).rejects.toThrow(ForbiddenException);
    });

    it("throws NotFoundException when the target user doesn't exist", async () => {
      em.update.mockResolvedValue(null);
      await expect(service.update(1, { first_name: "X" } as any, hr)).rejects.toThrow(NotFoundException);
    });

    it("only allows HR/super_admin to change role via update", async () => {
      em.update.mockResolvedValue({ id: 5 });
      await service.update(5, { role: UserRole.HR_MANAGER } as any, selfEmployee);
      expect(em.update).toHaveBeenCalledWith(5, {});
    });

    it("rejects an HR manager promoting a user to super_admin via update", async () => {
      await expect(service.update(5, { role: UserRole.SUPER_ADMIN } as any, hr)).rejects.toThrow(
        ForbiddenException,
      );
      expect(em.update).not.toHaveBeenCalled();
    });

    it("allows a super admin to promote a user to super_admin via update", async () => {
      em.update.mockResolvedValue({ id: 5, role: UserRole.SUPER_ADMIN });
      await service.update(5, { role: UserRole.SUPER_ADMIN } as any, superAdmin);
      expect(em.update).toHaveBeenCalledWith(5, { role: UserRole.SUPER_ADMIN });
    });

    it("applies allowed updates for HR", async () => {
      em.update.mockResolvedValue({ id: 1, firstName: "New" });
      const result = await service.update(1, { first_name: "New", role: UserRole.HR_EXECUTIVE } as any, hr);
      expect(em.update).toHaveBeenCalledWith(1, { firstName: "New", role: UserRole.HR_EXECUTIVE });
      expect(result).toEqual({ id: 1, firstName: "New" });
    });
  });

  describe("delete", () => {
    it("throws ForbiddenException for a non-privileged requester", async () => {
      await expect(service.delete(1, selfEmployee)).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when deleting your own account", async () => {
      await expect(service.delete(hr.userId, hr)).rejects.toThrow(BadRequestException);
    });

    it("purges PII and the keycloak account but keeps the employee row, deactivating it instead", async () => {
      em.findById.mockResolvedValue({ id: 3, employeeId: "EMP3", keycloakSub: "kc-3" });
      await service.delete(3, hr);
      expect(kc.deleteUser).toHaveBeenCalledWith("kc-3");
      expect(piiDeleteMock).toHaveBeenCalledWith("EMP3");
      expect(em.delete).not.toHaveBeenCalled();
      expect(em.update).toHaveBeenCalledWith(3, {
        status: EmployeeStatus.INACTIVE,
        keycloakSub: null,
        deletedAt: expect.any(Date),
      });
    });

    it("does not throw when keycloak deletion fails", async () => {
      em.findById.mockResolvedValue({ id: 3, keycloakSub: "kc-3" });
      kc.deleteUser.mockRejectedValue(new Error("kc error"));
      await expect(service.delete(3, hr)).resolves.toBeUndefined();
    });

    it("skips keycloak deletion when the user has no keycloakSub", async () => {
      em.findById.mockResolvedValue({ id: 3, keycloakSub: null });
      await service.delete(3, hr);
      expect(kc.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("throws ForbiddenException for a non-privileged requester", async () => {
      await expect(service.resetPassword(1, selfEmployee)).rejects.toThrow(ForbiddenException);
    });

    it("throws NotFoundException when the user doesn't exist", async () => {
      em.findById.mockResolvedValue(null);
      await expect(service.resetPassword(1, hr)).rejects.toThrow(NotFoundException);
    });

    it("throws ConflictException when the user isn't provisioned in keycloak", async () => {
      em.findById.mockResolvedValue({ id: 1, keycloakSub: null });
      await expect(service.resetPassword(1, hr)).rejects.toThrow(ConflictException);
    });

    it("updates the password in keycloak and sends the reset email successfully", async () => {
      em.findById.mockResolvedValue({ id: 1, keycloakSub: "kc-1", email: "a@b.com" });
      kc.updatePassword.mockResolvedValue(undefined);
      sendPasswordResetCredentialsEmailMock.mockResolvedValue({ success: true });

      const result = await service.resetPassword(1, hr);

      expect(kc.updatePassword).toHaveBeenCalledWith("kc-1", "Temp1234!@#", true);
      expect(result).toEqual({ emailSent: true, emailErrorReason: undefined });
    });

    it("throws HttpException(502) when the keycloak password update fails", async () => {
      em.findById.mockResolvedValue({ id: 1, keycloakSub: "kc-1", email: "a@b.com" });
      kc.updatePassword.mockRejectedValue(new Error("kc down"));
      await expect(service.resetPassword(1, hr)).rejects.toThrow(HttpException);
      expect(sendPasswordResetCredentialsEmailMock).not.toHaveBeenCalled();
    });

    it("does not throw when the reset email fails, and reports emailSent=false", async () => {
      em.findById.mockResolvedValue({ id: 1, keycloakSub: "kc-1", email: "a@b.com" });
      kc.updatePassword.mockResolvedValue(undefined);
      sendPasswordResetCredentialsEmailMock.mockResolvedValue({ success: false, error: "smtp down" });

      const result = await service.resetPassword(1, hr);
      expect(result).toEqual({ emailSent: false, emailErrorReason: "smtp down" });
    });
  });

  describe("getDepartments", () => {
    it("returns a flat list of department names", async () => {
      poolQueryMock.mockResolvedValue({ rows: [{ department: "Engineering" }, { department: "HR" }] });
      const result = await service.getDepartments();
      expect(result).toEqual(["Engineering", "HR"]);
    });
  });

  describe("updateRole", () => {
    it("throws ForbiddenException for a non-super-admin", async () => {
      await expect(service.updateRole(1, UserRole.HR_MANAGER, hr)).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when changing your own role", async () => {
      await expect(service.updateRole(superAdmin.userId, UserRole.HR_MANAGER, superAdmin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException for an invalid role", async () => {
      await expect(service.updateRole(5, "not_a_role", superAdmin)).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException when the target user doesn't exist", async () => {
      em.findById.mockResolvedValue(null);
      await expect(service.updateRole(5, UserRole.HR_MANAGER, superAdmin)).rejects.toThrow(NotFoundException);
    });

    it("updates the role and returns before/after", async () => {
      em.findById.mockResolvedValue({ id: 5, role: UserRole.EMPLOYEE });
      em.update.mockResolvedValue({ id: 5, role: UserRole.HR_MANAGER });
      const result = await service.updateRole(5, UserRole.HR_MANAGER, superAdmin);
      expect(result).toEqual({ id: 5, previous_role: UserRole.EMPLOYEE, new_role: UserRole.HR_MANAGER });
    });
  });

  describe("provisionKeycloak", () => {
    it("throws NotFoundException when the user doesn't exist", async () => {
      em.findById.mockResolvedValue(null);
      await expect(service.provisionKeycloak(1)).rejects.toThrow(NotFoundException);
    });

    it("returns alreadyProvisioned when the user already has a keycloakSub", async () => {
      em.findById.mockResolvedValue({ id: 1, keycloakSub: "kc-existing" });
      const result = await service.provisionKeycloak(1);
      expect(result).toEqual({ alreadyProvisioned: true, keycloakSub: "kc-existing" });
      expect(kc.createUser).not.toHaveBeenCalled();
    });

    it("provisions a new keycloak user and sends the onboarding email", async () => {
      em.findById.mockResolvedValue({ id: 1, keycloakSub: null, email: "a@b.com", firstName: "A", lastName: "B", role: UserRole.EMPLOYEE });
      kc.createUser.mockResolvedValue("kc-new");
      sendWelcomeCredentialsEmailMock.mockResolvedValue({ success: true });
      const result = await service.provisionKeycloak(1);
      expect(em.linkKeycloakSub).toHaveBeenCalledWith(1, "kc-new");
      expect(result).toEqual({ alreadyProvisioned: false, keycloakSub: "kc-new", onboardingEmailSent: true, emailErrorReason: undefined });
    });

    it("still succeeds but flags onboardingEmailSent=false when the email fails", async () => {
      em.findById.mockResolvedValue({ id: 1, keycloakSub: null, email: "a@b.com", firstName: "A", lastName: "B", role: UserRole.EMPLOYEE });
      kc.createUser.mockResolvedValue("kc-new");
      sendWelcomeCredentialsEmailMock.mockResolvedValue({ success: false, error: "smtp down" });
      const result = await service.provisionKeycloak(1);
      expect(result.onboardingEmailSent).toBe(false);
      expect(result.emailErrorReason).toBe("smtp down");
    });
  });
});
