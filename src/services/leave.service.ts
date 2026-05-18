import pool from '../config/database';
import { LeaveModel } from '../models/Leave';
import { LeaveCalendarModel } from '../models/LeaveCalendar';
import {
  LeaveBalance,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  UserRole,
} from '../types';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../utils/AppError';
import {
  CreateLeaveRequestInput,
  LeaveBalanceQuery,
  ListLeaveRequestsQuery,
} from '../validators/leave.validator';

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
    userId: number,
    query: LeaveBalanceQuery
  ): Promise<LeaveBalance[]> {
    return LeaveModel.getLeaveBalance(userId, query.year);
  },

  async listLeaveRequests(
    userId: number,
    role: UserRole,
    query: ListLeaveRequestsQuery
  ): Promise<LeaveRequest[]> {
    if (role === UserRole.EMPLOYEE) {
      return LeaveModel.findByUserId(userId, {
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
    userId: number,
    role: UserRole
  ): Promise<LeaveRequest> {
    const request = await LeaveModel.findById(id);
    if (!request) {
      throw new NotFoundError('Leave request not found');
    }
    if (role === UserRole.EMPLOYEE && request.user_id !== userId) {
      throw new ForbiddenError();
    }
    return request;
  },

  async createLeaveRequest(
    userId: number,
    input: CreateLeaveRequestInput,
    attachmentUrl?: string
  ): Promise<LeaveRequest> {
    const start = new Date(input.start_date);
    const end = new Date(input.end_date);

    const totalDays = input.is_half_day
      ? 0.5
      : await calculateWorkingDays(start, end);

    if (totalDays <= 0) {
      throw new BadRequestError('Invalid date range');
    }

    const balances = await LeaveModel.getLeaveBalance(userId);
    const balance = balances.find(b => b.leave_type_id === input.leave_type_id);

    if (!balance) {
      throw new BadRequestError('Leave balance not found for this leave type');
    }

    if (balance.remaining_days < totalDays) {
      throw new BadRequestError(
        `Insufficient leave balance. Available: ${balance.remaining_days} days, Requested: ${totalDays} days`
      );
    }

    return LeaveModel.createRequest({
      user_id: userId,
      leave_type_id: input.leave_type_id,
      start_date: start,
      end_date: end,
      total_days: totalDays,
      is_half_day: input.is_half_day,
      half_day_period: input.half_day_period,
      reason: input.reason,
      attachment_url: attachmentUrl,
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
        'SELECT manager_id FROM users WHERE id = $1',
        [request.user_id]
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
        actorRole !== UserRole.HR_EXECUTIVE &&
        actorRole !== UserRole.SUPER_ADMIN
      ) {
        throw new ForbiddenError('Only HR can approve');
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
      actorRole !== UserRole.HR_EXECUTIVE &&
      actorRole !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenError('Only HR can reject leave requests');
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
