import { UserRole } from '../../types';
import { AccessLevel, PERMISSIONS, PermissionKey } from './permissions';

export interface DefaultPermissionGrant {
  key: PermissionKey;
  accessLevel: AccessLevel;
}

/**
 * Single source of truth for the `tbl_user_permissions` rows a newly
 * created (or JIT-provisioned) user should get by default, keyed by role.
 *
 * Used by:
 *  - UsersService.create (new employee created via POST /users)
 *  - EmployeeModel.findOrCreateFromKeycloak (JIT provisioning on first
 *    Keycloak login when no local employee row exists yet)
 *  - main.ts bootstrap (self-healing backfill for existing employees on
 *    every server start)
 *
 * Roles not listed here (SUPER_ADMIN, SERVICE_PROVIDER) either bypass the
 * permission table entirely (SUPER_ADMIN) or are out of scope for this map.
 *
 * HR_EXECUTIVE deliberately does NOT include PROFILE_CHANGE_REQUESTS -
 * Profile Approvals (menu + approve/reject/return) is restricted to
 * Administrator (super_admin, which bypasses this table) and HR_MANAGER
 * only (see OCD-473).
 */
export const DEFAULT_PERMISSIONS_BY_ROLE: Partial<Record<UserRole, DefaultPermissionGrant[]>> = {
  [UserRole.EMPLOYEE]: [
    { key: PERMISSIONS.DASHBOARD, accessLevel: 'read' },
    { key: PERMISSIONS.LEAVES, accessLevel: 'read' },
    { key: PERMISSIONS.SALARIES, accessLevel: 'read' },
    { key: PERMISSIONS.FACILITIES, accessLevel: 'read' },
    { key: PERMISSIONS.MEDICAL_CLAIMS, accessLevel: 'read' },
    { key: PERMISSIONS.REPORTS, accessLevel: 'read' },
    { key: PERMISSIONS.WORK_LOGS, accessLevel: 'read' },
    { key: PERMISSIONS.COMMUNICATIONS, accessLevel: 'read' },
    { key: PERMISSIONS.FORMS, accessLevel: 'read' },
    { key: PERMISSIONS.DOCUMENT_VAULT, accessLevel: 'read' },
  ],

  // OCD-445 / OCD-457: HR Manager previously got no default permissions at
  // all, so the Users menu (and every other HR module) was invisible.
  [UserRole.HR_MANAGER]: [
    { key: PERMISSIONS.DASHBOARD, accessLevel: 'read' },
    { key: PERMISSIONS.USERS, accessLevel: 'write' },
    { key: PERMISSIONS.PROFILE_CHANGE_REQUESTS, accessLevel: 'write' },
    { key: PERMISSIONS.EMPLOYEE_NOTES, accessLevel: 'write' },
    { key: PERMISSIONS.LEAVES, accessLevel: 'write' },
    { key: PERMISSIONS.SALARIES, accessLevel: 'write' },
    { key: PERMISSIONS.FACILITIES, accessLevel: 'write' },
    { key: PERMISSIONS.MEDICAL_CLAIMS, accessLevel: 'write' },
    { key: PERMISSIONS.CONSULTANT_SUBMISSIONS, accessLevel: 'write' },
    { key: PERMISSIONS.REPORTS, accessLevel: 'write' },
    { key: PERMISSIONS.COMMUNICATIONS, accessLevel: 'write' },
    { key: PERMISSIONS.EVENTS, accessLevel: 'write' },
    { key: PERMISSIONS.FORMS, accessLevel: 'write' },
    { key: PERMISSIONS.WORK_LOGS, accessLevel: 'write' },
    { key: PERMISSIONS.GROUPS, accessLevel: 'write' },
    { key: PERMISSIONS.NOTICES, accessLevel: 'write' },
    { key: PERMISSIONS.ATTENDANCE, accessLevel: 'read' },
    { key: PERMISSIONS.DOCUMENT_VAULT, accessLevel: 'write' },
    // OCD-453: only HR Manager (and super_admin, which bypasses this table)
    // can view the Archive - HR Executive is deliberately excluded, same
    // gating as who can delete a user in the first place.
    { key: PERMISSIONS.ARCHIVE, accessLevel: 'read' },
  ],

  // OCD-445 / OCD-457: HR Executive previously got no default permissions
  // either. Same set as HR Manager MINUS profile_change_requests (OCD-473 -
  // Profile Approvals stays Administrator/HR Manager only) and work_logs
  // write (the catalog documents that level as HR Manager-specific).
  [UserRole.HR_EXECUTIVE]: [
    { key: PERMISSIONS.DASHBOARD, accessLevel: 'read' },
    { key: PERMISSIONS.USERS, accessLevel: 'write' },
    { key: PERMISSIONS.EMPLOYEE_NOTES, accessLevel: 'write' },
    { key: PERMISSIONS.LEAVES, accessLevel: 'write' },
    { key: PERMISSIONS.SALARIES, accessLevel: 'write' },
    { key: PERMISSIONS.FACILITIES, accessLevel: 'write' },
    { key: PERMISSIONS.MEDICAL_CLAIMS, accessLevel: 'write' },
    { key: PERMISSIONS.CONSULTANT_SUBMISSIONS, accessLevel: 'write' },
    { key: PERMISSIONS.REPORTS, accessLevel: 'write' },
    { key: PERMISSIONS.COMMUNICATIONS, accessLevel: 'write' },
    { key: PERMISSIONS.EVENTS, accessLevel: 'write' },
    { key: PERMISSIONS.FORMS, accessLevel: 'write' },
    { key: PERMISSIONS.GROUPS, accessLevel: 'write' },
    { key: PERMISSIONS.NOTICES, accessLevel: 'write' },
    { key: PERMISSIONS.ATTENDANCE, accessLevel: 'read' },
    { key: PERMISSIONS.DOCUMENT_VAULT, accessLevel: 'write' },
  ],

  // OCD-457: Finance Manager logged in to a completely empty side nav.
  [UserRole.FINANCE_MANAGER]: [
    { key: PERMISSIONS.DASHBOARD, accessLevel: 'read' },
    { key: PERMISSIONS.USERS, accessLevel: 'read' },
    { key: PERMISSIONS.LEAVES, accessLevel: 'read' },
    { key: PERMISSIONS.SALARIES, accessLevel: 'read' },
    { key: PERMISSIONS.FACILITIES, accessLevel: 'read' },
    // OCD-494: write so the Medical Insurance (Administration) nav link and
    // payment-processing action are available - Finance Manager records
    // payment for approved claims, same as Finance Executive below.
    { key: PERMISSIONS.MEDICAL_CLAIMS, accessLevel: 'write' },
    { key: PERMISSIONS.COMMUNICATIONS, accessLevel: 'read' },
    { key: PERMISSIONS.FORMS, accessLevel: 'read' },
    { key: PERMISSIONS.DOCUMENT_VAULT, accessLevel: 'read' },
    { key: PERMISSIONS.VOUCHERS_VIEW, accessLevel: 'write' },
    { key: PERMISSIONS.VOUCHERS_CREATE, accessLevel: 'write' },
    { key: PERMISSIONS.VOUCHERS_RESUBMIT, accessLevel: 'write' },
    { key: PERMISSIONS.VOUCHERS_BANK_UPLOAD, accessLevel: 'write' },
    { key: PERMISSIONS.VOUCHERS_MARK_PAID, accessLevel: 'write' },
  ],

  // OCD-457: Finance Executive logged in to a completely empty side nav.
  [UserRole.FINANCE_EXECUTIVE]: [
    { key: PERMISSIONS.DASHBOARD, accessLevel: 'read' },
    { key: PERMISSIONS.USERS, accessLevel: 'read' },
    { key: PERMISSIONS.LEAVES, accessLevel: 'read' },
    { key: PERMISSIONS.SALARIES, accessLevel: 'read' },
    { key: PERMISSIONS.FACILITIES, accessLevel: 'read' },
    // OCD-494: write so the Medical Insurance (Administration) nav link and
    // payment-processing action are available.
    { key: PERMISSIONS.MEDICAL_CLAIMS, accessLevel: 'write' },
    { key: PERMISSIONS.COMMUNICATIONS, accessLevel: 'read' },
    { key: PERMISSIONS.FORMS, accessLevel: 'read' },
    { key: PERMISSIONS.DOCUMENT_VAULT, accessLevel: 'read' },
    { key: PERMISSIONS.VOUCHERS_VIEW, accessLevel: 'read' },
    { key: PERMISSIONS.VOUCHERS_REVIEW, accessLevel: 'write' },
  ],

  // OCD-457: Consultant logged in to a completely empty side nav.
  [UserRole.CONSULTANT]: [
    { key: PERMISSIONS.DASHBOARD, accessLevel: 'read' },
    { key: PERMISSIONS.CONSULTANT_SUBMISSIONS, accessLevel: 'read' },
    { key: PERMISSIONS.SALARIES, accessLevel: 'read' },
    { key: PERMISSIONS.COMMUNICATIONS, accessLevel: 'read' },
    { key: PERMISSIONS.FORMS, accessLevel: 'read' },
    { key: PERMISSIONS.DOCUMENT_VAULT, accessLevel: 'read' },
  ],
};
