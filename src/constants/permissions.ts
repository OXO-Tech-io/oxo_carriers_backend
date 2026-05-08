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
    | "reports";
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
];

export const PERMISSION_KEYS = new Set(
  PERMISSION_CATALOG.map((item) => item.key),
);
