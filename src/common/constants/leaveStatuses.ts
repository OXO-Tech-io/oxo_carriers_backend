import { LeaveStatus } from "../../types";

// Leave requests still awaiting an approval decision - shown in the Pending
// Approvals tab (LeavesService.listLeaveRequests) and counted as pending on
// the dashboard (ReportsService.getDashboardMetrics).
export const PENDING_APPROVAL_STATUSES: LeaveStatus[] = [LeaveStatus.PENDING, LeaveStatus.HR_MANAGER_APPROVED];

// Requests not yet finally HR-approved - their days are still "tied up".
export const NOT_YET_APPROVED_STATUSES: LeaveStatus[] = [
  LeaveStatus.PENDING,
  LeaveStatus.TEAM_LEADER_APPROVED,
  LeaveStatus.HR_MANAGER_APPROVED,
];

// Requests that still occupy their dates (pending or approved) - used for overlap checks.
export const ACTIVE_LEAVE_STATUSES: LeaveStatus[] = [...NOT_YET_APPROVED_STATUSES, LeaveStatus.HR_APPROVED];
