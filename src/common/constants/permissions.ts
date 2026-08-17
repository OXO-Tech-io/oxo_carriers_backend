export const PERMISSIONS = {
  DASHBOARD: "dashboard",
  USERS: "users",
  PERMISSIONS: "permissions",
  VOUCHERS_VIEW: "vouchers.view",
  VOUCHERS_CREATE: "vouchers.create",
  VOUCHERS_REVIEW: "vouchers.review",
  VOUCHERS_RESUBMIT: "vouchers.resubmit",
  VOUCHERS_BANK_UPLOAD: "vouchers.bank_upload",
  VOUCHERS_MARK_PAID: "vouchers.mark_paid",
  LEAVES: "leaves",
  SALARIES: "salaries",
  FACILITIES: "facilities",
  MEDICAL_CLAIMS: "medical_claims",
  CONSULTANT_SUBMISSIONS: "consultant_submissions",
  VENDORS: "vendors",
  REPORTS: "reports",
  PROFILE_CHANGE_REQUESTS: "profile_change_requests",
  EMPLOYEE_NOTES: "employee_notes",
  COMMUNICATIONS: "communications",
  EVENTS: "events",
  FORMS: "forms",
  WORK_LOGS: "work_logs",
  GROUPS: "groups",
  NOTICES: "notices",
  ATTENDANCE: "attendance",
  DOCUMENT_VAULT: "document_vault",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type AccessLevel = "read" | "write";

export interface PermissionAssignment {
  key: PermissionKey;
  accessLevel: AccessLevel;
}

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
  group:
    | "core"
    | "users"
    | "permissions"
    | "vouchers"
    | "leaves"
    | "salaries"
    | "facilities"
    | "claims"
    | "consultants"
    | "vendors"
    | "reports"
    | "profile"
    | "employee_notes"
    | "communications"
    | "events"
    | "forms"
    | "work_logs"
    | "groups"
    | "notices"
    | "attendance"
    | "documents";
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    key: PERMISSIONS.DASHBOARD,
    label: "Dashboard",
    description: "Can access dashboards and summary cards.",
    group: "core",
  },
  {
    key: PERMISSIONS.USERS,
    label: "Users",
    description: "Can view and manage users.",
    group: "users",
  },
  {
    key: PERMISSIONS.PERMISSIONS,
    label: "Permissions",
    description: "Can view and manage permission assignments.",
    group: "permissions",
  },
  {
    key: PERMISSIONS.VOUCHERS_VIEW,
    label: "View Vouchers",
    description: "Can view voucher list and voucher details.",
    group: "vouchers",
  },
  {
    key: PERMISSIONS.VOUCHERS_CREATE,
    label: "Create Vouchers",
    description: "Can create payment vouchers.",
    group: "vouchers",
  },
  {
    key: PERMISSIONS.VOUCHERS_REVIEW,
    label: "Review Vouchers",
    description: "Can approve, reject, or request information for vouchers.",
    group: "vouchers",
  },
  {
    key: PERMISSIONS.VOUCHERS_RESUBMIT,
    label: "Resubmit Vouchers",
    description: "Can resubmit vouchers after information request.",
    group: "vouchers",
  },
  {
    key: PERMISSIONS.VOUCHERS_BANK_UPLOAD,
    label: "Mark Bank Upload",
    description: "Can mark approved vouchers as bank uploaded.",
    group: "vouchers",
  },
  {
    key: PERMISSIONS.VOUCHERS_MARK_PAID,
    label: "Mark Paid",
    description: "Can mark bank-uploaded vouchers as paid.",
    group: "vouchers",
  },
  {
    key: PERMISSIONS.LEAVES,
    label: "Leaves",
    description: "Can view and manage leave requests and balances.",
    group: "leaves",
  },
  {
    key: PERMISSIONS.SALARIES,
    label: "Salaries",
    description: "Can view and manage salary data.",
    group: "salaries",
  },
  {
    key: PERMISSIONS.FACILITIES,
    label: "Facilities",
    description: "Can view and manage facilities and bookings.",
    group: "facilities",
  },
  {
    key: PERMISSIONS.MEDICAL_CLAIMS,
    label: "Medical Claims",
    description: "Can view and manage medical insurance claims.",
    group: "claims",
  },
  {
    key: PERMISSIONS.CONSULTANT_SUBMISSIONS,
    label: "Consultant Submissions",
    description: "Can view and manage consultant work submissions.",
    group: "consultants",
  },
  {
    key: PERMISSIONS.VENDORS,
    label: "Vendors",
    description: "Can view and manage vendors.",
    group: "vendors",
  },
  {
    key: PERMISSIONS.REPORTS,
    label: "Reports",
    description: "Can access and manage reports.",
    group: "reports",
  },
  {
    key: PERMISSIONS.PROFILE_CHANGE_REQUESTS,
    label: "Profile Change Requests",
    description:
      "Can view/submit own profile change requests; write access lets HR review and decide on them.",
    group: "profile",
  },
  {
    key: PERMISSIONS.EMPLOYEE_NOTES,
    label: "Employee Notes",
    description:
      "Write access lets HR Team add notes to an employee profile (create-only). Full read/edit access is restricted to HR Manager regardless of this key.",
    group: "employee_notes",
  },
  {
    key: PERMISSIONS.COMMUNICATIONS,
    label: "Communications",
    description: "Can create and send employee communications and view delivery/response reports.",
    group: "communications",
  },
  {
    key: PERMISSIONS.EVENTS,
    label: "Events",
    description: "Can create events and record employee participation.",
    group: "events",
  },
  {
    key: PERMISSIONS.FORMS,
    label: "Forms",
    description: "Can create forms, distribute them to employees, and view/export responses.",
    group: "forms",
  },
  {
    key: PERMISSIONS.WORK_LOGS,
    label: "Work Logs",
    description:
      "Write access lets HR Manager view all employee work log submissions and set the daily submission deadline.",
    group: "work_logs",
  },
  {
    key: PERMISSIONS.GROUPS,
    label: "Groups",
    description:
      "Can create and manage employee groups (name, members), and use them as recipients for communications and forms.",
    group: "groups",
  },
  {
    key: PERMISSIONS.NOTICES,
    label: "Notices",
    description:
      "Write access lets a user create and update notice board announcements, visible to every employee and system user on their dashboard.",
    group: "notices",
  },
  {
    key: PERMISSIONS.ATTENDANCE,
    label: "Attendance",
    description:
      "Can view every employee's clock in/out time and daily worked hours. Super admins can always see this regardless of this grant.",
    group: "attendance",
  },
  {
    key: PERMISSIONS.DOCUMENT_VAULT,
    label: "Document Vault",
    description:
      "Write access lets a user upload documents to specific employees or to everyone. Read access lets an employee view the documents assigned to them plus any sent to all employees.",
    group: "documents",
  },
];

export const PERMISSION_KEYS = new Set(
  PERMISSION_CATALOG.map((item) => item.key),
);
