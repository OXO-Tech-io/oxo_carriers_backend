import pool from '../../config/database';
import { LeaveModel } from './Leave';
import { LeaveCalendarModel } from '../leave-calendar/LeaveCalendar';
import { EmployeeModel } from '../../employees/Employee';
import {
  EmployeeStatus,
  LeaveBalance,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  UserRole,
} from '../../types';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../utils/AppError';
import {
  CreateLeaveRequestInput,
  LeaveBalanceQuery,
  ListLeaveRequestsQuery,
} from '../../validators/leave.validator';

const calculateWorkingDays = async (
  startDate: Date,
  endDate: Date
): Promise<number> => {
  const holidays = await LeaveCalendarModel.getHolidaysInRange(startDate, endDate);
  const holidayDates = new Set(
    holidays.map(h => h.date.toISOString().split('T')[0])
  );

  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};

export const leaveService = {
  async getLeaveTypes(): Promise<LeaveType[]> {
    return LeaveModel.getLeaveTypes();
  },

  async getLeaveBalance(
    employeeId: string,
    query: LeaveBalanceQuery
  ): Promise<LeaveBalance[]> {
    return LeaveModel.getLeaveBalance(employeeId, query.year);
  },

  /** `selfOnly` is decided by the caller (LeavesService, based on role +
   * the `mine` query flag) rather than by role here, since which roles are
   * allowed to see everyone's requests is an access-control decision, not a
   * data-shape one. */
  async listLeaveRequests(
    employeeId: string,
    selfOnly: boolean,
    query: ListLeaveRequestsQuery
  ): Promise<LeaveRequest[]> {
    if (selfOnly) {
      return LeaveModel.findByEmployeeId(employeeId, {
        status: query.status,
        year: query.year,
      });
    }
    return LeaveModel.getAll({
      status: query.status,
      department: query.department,
      year: query.year,
    });
  },

  async getLeaveRequestById(
    id: number,
    employeeId: string,
    role: UserRole
  ): Promise<LeaveRequest> {
    const request = await LeaveModel.findById(id);
    if (!request) {
      throw new NotFoundError('Leave request not found');
    }
    if (role === UserRole.EMPLOYEE && request.employee_id !== employeeId) {
      throw new ForbiddenError();
    }
    return request;
  },

  async createLeaveRequest(
    employeeId: string,
    input: CreateLeaveRequestInput,
    attachmentUrl?: string
  ): Promise<LeaveRequest> {
    if (!attachmentUrl) {
      throw new BadRequestError('An attachment is required to submit a leave request');
    }

    const start = new Date(input.start_date);
    const end = new Date(input.end_date);

    const totalDays = input.is_half_day
      ? 0.5
      : await calculateWorkingDays(start, end);

    if (totalDays <= 0) {
      throw new BadRequestError('Invalid date range');
    }

    // Block a new request for a date the employee already has a pending or
    // approved request on - two full-day (or same-half) requests can never
    // coexist, but a morning half-day leaves the evening half still bookable.
    const overlapping = await LeaveModel.findOverlappingRequestsForEmployee(
      employeeId,
      input.start_date,
      input.end_date,
    );
    const hasBlockingOverlap = overlapping.some((existing) => {
      if (!existing.is_half_day) return true;
      if (!input.is_half_day) return true;
      return existing.half_day_period === input.half_day_period;
    });
    if (hasBlockingOverlap) {
      throw new BadRequestError(
        'You already have a pending or approved leave request that overlaps this date'
      );
    }

    const balances = await LeaveModel.getLeaveBalance(employeeId);
    const balance = balances.find(b => b.leave_type_id === input.leave_type_id);

    if (!balance) {
      throw new BadRequestError('Leave balance not found for this leave type');
    }

    if (balance.available_days < totalDays) {
      throw new BadRequestError(
        `Insufficient leave balance. Available: ${balance.available_days} days, Requested: ${totalDays} days`
      );
    }

    if (input.coverup_employee_id) {
      if (input.coverup_employee_id === employeeId) {
        throw new BadRequestError('You cannot select yourself as the coverup employee');
      }
      const coverupEmployee = await EmployeeModel.findByEmployeeId(input.coverup_employee_id);
      if (!coverupEmployee || coverupEmployee.status !== EmployeeStatus.ACTIVE) {
        throw new BadRequestError('Coverup employee not found or inactive');
      }
      const conflicting = await LeaveModel.findEmployeeIdsWithOverlappingLeave(
        [input.coverup_employee_id],
        input.start_date,
        input.end_date,
      );
      if (conflicting.has(input.coverup_employee_id)) {
        throw new BadRequestError('The selected coverup employee already has leave scheduled during this period');
      }
    }

    return LeaveModel.createRequest({
      employee_id: employeeId,
      leave_type_id: input.leave_type_id,
      start_date: start,
      end_date: end,
      total_days: totalDays,
      is_half_day: input.is_half_day,
      half_day_period: input.half_day_period,
      reason: input.reason,
      attachment_url: attachmentUrl,
      coverup_employee_id: input.coverup_employee_id,
    });
  },

  async approveLeaveRequest(
    id: number,
    actorUserId: number,
    actorRole: UserRole,
    approvedBy: 'team_leader' | 'hr',
    rejectionReason?: string
  ): Promise<LeaveRequest> {
    const request = await LeaveModel.findById(id);
    if (!request) {
      throw new NotFoundError('Leave request not found');
    }

    let newStatus: LeaveStatus;

    if (approvedBy === 'team_leader') {
      const result = await pool.query(
        'SELECT manager_id FROM tbl_employee WHERE employee_id = $1',
        [request.employee_id]
      );
      const requester = (result.rows as Array<{ manager_id: number | null }>)[0];
      if (!requester || requester.manager_id !== actorUserId) {
        throw new ForbiddenError(
          'Only the team leader can approve this request'
        );
      }
      if (request.status !== LeaveStatus.PENDING) {
        throw new BadRequestError(
          'Invalid request status for team leader approval'
        );
      }
      newStatus = LeaveStatus.TEAM_LEADER_APPROVED;
    } else {
      if (
        actorRole !== UserRole.HR_MANAGER &&
        actorRole !== UserRole.SUPER_ADMIN
      ) {
        throw new ForbiddenError('Only an Administrator or HR Manager can approve');
      }
      if (
        request.status !== LeaveStatus.PENDING &&
        request.status !== LeaveStatus.TEAM_LEADER_APPROVED
      ) {
        throw new BadRequestError('Invalid request status for HR approval');
      }
      newStatus = LeaveStatus.HR_APPROVED;
    }

    const updated = await LeaveModel.updateStatus(
      id,
      newStatus,
      approvedBy,
      rejectionReason
    );
    if (!updated) {
      throw new NotFoundError('Leave request not found');
    }
    return updated;
  },

  async rejectLeaveRequest(
    id: number,
    actorRole: UserRole,
    rejectionReason: string
  ): Promise<LeaveRequest> {
    if (
      actorRole !== UserRole.HR_MANAGER &&
      actorRole !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenError('Only an Administrator or HR Manager can reject leave requests');
    }

    const request = await LeaveModel.findById(id);
    if (!request) {
      throw new NotFoundError('Leave request not found');
    }

    const updated = await LeaveModel.updateStatus(
      id,
      LeaveStatus.REJECTED,
      'hr',
      rejectionReason
    );
    if (!updated) {
      throw new NotFoundError('Leave request not found');
    }
    return updated;
  },
};
