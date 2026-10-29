import { LeaveStatus } from "../../types";

// Leave requests still awaiting an approval decision - shown in the Pending
// Approvals tab (LeavesService.listLeaveRequests) and counted as pending on
// the dashboard (ReportsService.getDashboardMetrics).
export const PENDING_APPROVAL_STATUSES: LeaveStatus[] = [LeaveStatus.PENDING, LeaveStatus.HR_MANAGER_APPROVED];
