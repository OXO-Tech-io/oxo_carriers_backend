import { describe, expect, it } from "vitest";
import { UserRole } from "../../src/types";
import {
  canDecideAtStage,
  firstApprovalStage,
  getApprovalChain,
  nextApprovalStage,
  ON_BEHALF_SUBMITTER_ROLES,
  roleForStage,
} from "../../src/modules/profile-change-requests/approvalChain";

describe("profile change approval chain (OCD-603/604/605)", () => {
  it("routes employee and HR Executive requests HR Manager -> Administrator", () => {
    expect(getApprovalChain(UserRole.EMPLOYEE)).toEqual(["hr_manager", "admin"]);
    expect(getApprovalChain(UserRole.HR_EXECUTIVE)).toEqual(["hr_manager", "admin"]);
    expect(getApprovalChain(UserRole.CONSULTANT)).toEqual(["hr_manager", "admin"]);
  });

  it("routes HR Manager (and Administrator) requests straight to the Administrator", () => {
    expect(getApprovalChain(UserRole.HR_MANAGER)).toEqual(["admin"]);
    expect(getApprovalChain(UserRole.SUPER_ADMIN)).toEqual(["admin"]);
    expect(firstApprovalStage(UserRole.HR_MANAGER)).toBe("admin");
  });

  it("advances stage by stage and ends after the Administrator", () => {
    expect(nextApprovalStage(UserRole.EMPLOYEE, "hr_manager")).toBe("admin");
    expect(nextApprovalStage(UserRole.EMPLOYEE, "admin")).toBeNull();
    expect(nextApprovalStage(UserRole.HR_MANAGER, "admin")).toBeNull();
  });

  it("only lets the stage owner decide", () => {
    expect(canDecideAtStage(UserRole.HR_MANAGER, "hr_manager")).toBe(true);
    expect(canDecideAtStage(UserRole.SUPER_ADMIN, "hr_manager")).toBe(false);
    expect(canDecideAtStage(UserRole.SUPER_ADMIN, "admin")).toBe(true);
    expect(canDecideAtStage(UserRole.HR_MANAGER, "admin")).toBe(false);
    expect(canDecideAtStage(UserRole.HR_EXECUTIVE, "hr_manager")).toBe(false);
    expect(roleForStage("admin")).toBe(UserRole.SUPER_ADMIN);
  });

  it("limits on-behalf submissions to HR and the Administrator", () => {
    expect(ON_BEHALF_SUBMITTER_ROLES).toContain(UserRole.HR_EXECUTIVE);
    expect(ON_BEHALF_SUBMITTER_ROLES).toContain(UserRole.HR_MANAGER);
    expect(ON_BEHALF_SUBMITTER_ROLES).not.toContain(UserRole.EMPLOYEE);
  });
});
