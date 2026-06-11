import { Request, Response } from 'express';
import { leaveService } from '../services/leave.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import {
  ApproveLeaveRequestInput,
  CreateLeaveRequestInput,
  LeaveBalanceQuery,
  LeaveIdParam,
  ListLeaveRequestsQuery,
  RejectLeaveRequestInput,
} from '../validators/leave.validator';
import {
  sendLeaveSubmittedEmail,
  sendLeaveApprovedEmail,
  sendLeaveRejectedEmail,
} from '../config/email';
import { logger } from '../lib/logger';

const requireUser = (req: Request) => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

export const getLeaveTypes = async (_req: Request, res: Response) => {
  const types = await leaveService.getLeaveTypes();
  ok(res, types, 'Leave types fetched');
};

export const getLeaveBalance = async (req: Request, res: Response) => {
  const { userId } = requireUser(req);
  const query = req.query as unknown as LeaveBalanceQuery;
  const balances = await leaveService.getLeaveBalance(userId, query);
  ok(res, balances, 'Leave balance fetched');
};

export const getLeaveRequests = async (req: Request, res: Response) => {
  const { userId, role } = requireUser(req);
  const query = req.query as unknown as ListLeaveRequestsQuery;
  const requests = await leaveService.listLeaveRequests(userId, role, query);
  ok(res, requests, 'Leave requests fetched');
};

export const getLeaveRequestById = async (req: Request, res: Response) => {
  const { userId, role } = requireUser(req);
  const { id } = req.params as unknown as LeaveIdParam;
  const request = await leaveService.getLeaveRequestById(id, userId, role);
  ok(res, request, 'Leave request fetched');
};

export const createLeaveRequest = async (req: Request, res: Response) => {
  const { userId } = requireUser(req);
  const input = req.body as CreateLeaveRequestInput;
  const attachmentUrl = req.file
    ? `/uploads/documents/${req.file.filename}`
    : undefined;
  const request = await leaveService.createLeaveRequest(
    userId,
    input,
    attachmentUrl
  );
  created(res, request, 'Leave request created');

  // Send confirmation email to employee (non-blocking)
  try {
    const employeeName = request.user
      ? `${request.user.first_name} ${request.user.last_name}`.trim()
      : 'Employee';
    const employeeEmail = request.user?.email;
    if (employeeEmail) {
      await sendLeaveSubmittedEmail(employeeEmail, {
        employeeName,
        leaveType: request.leave_type?.name ?? 'Leave',
        startDate: new Date(request.start_date).toLocaleDateString('en-GB'),
        endDate: new Date(request.end_date).toLocaleDateString('en-GB'),
        totalDays: request.total_days,
        reason: request.reason ?? undefined,
        submittedDate: new Date().toLocaleDateString('en-GB'),
        referenceNumber: `LV-${request.id}`,
      });
    }
  } catch (emailErr: any) {
    logger.error({ err: emailErr }, 'Failed to send leave submitted email');
  }
};

export const approveLeaveRequest = async (req: Request, res: Response) => {
  const { userId, role } = requireUser(req);
  const { id } = req.params as unknown as LeaveIdParam;
  const { approvedBy, rejectionReason } = req.body as ApproveLeaveRequestInput;
  const updated = await leaveService.approveLeaveRequest(
    id,
    userId,
    role,
    approvedBy,
    rejectionReason
  );
  ok(res, updated, 'Leave request updated');

  // Send approval email to employee (non-blocking)
  try {
    const employeeName = updated.user
      ? `${updated.user.first_name} ${updated.user.last_name}`.trim()
      : 'Employee';
    const employeeEmail = updated.user?.email;
    if (employeeEmail) {
      await sendLeaveApprovedEmail(employeeEmail, {
        employeeName,
        leaveType: updated.leave_type?.name ?? 'Leave',
        startDate: new Date(updated.start_date).toLocaleDateString('en-GB'),
        endDate: new Date(updated.end_date).toLocaleDateString('en-GB'),
        totalDays: updated.total_days,
        approvedDate: new Date().toLocaleDateString('en-GB'),
        approvedBy: approvedBy === 'team_leader' ? 'Team Leader' : 'HR Management',
        referenceNumber: `LV-${updated.id}`,
      });
    }
  } catch (emailErr: any) {
    logger.error({ err: emailErr }, 'Failed to send leave approved email');
  }
};

export const rejectLeaveRequest = async (req: Request, res: Response) => {
  const { role } = requireUser(req);
  const { id } = req.params as unknown as LeaveIdParam;
  const { rejectionReason } = req.body as RejectLeaveRequestInput;
  const updated = await leaveService.rejectLeaveRequest(
    id,
    role,
    rejectionReason
  );
  ok(res, updated, 'Leave request rejected');

  // Send rejection email to employee (non-blocking)
  try {
    const employeeName = updated.user
      ? `${updated.user.first_name} ${updated.user.last_name}`.trim()
      : 'Employee';
    const employeeEmail = updated.user?.email;
    if (employeeEmail) {
      await sendLeaveRejectedEmail(employeeEmail, {
        employeeName,
        leaveType: updated.leave_type?.name ?? 'Leave',
        startDate: new Date(updated.start_date).toLocaleDateString('en-GB'),
        endDate: new Date(updated.end_date).toLocaleDateString('en-GB'),
        totalDays: updated.total_days,
        rejectionReason: rejectionReason ?? 'No reason provided.',
        referenceNumber: `LV-${updated.id}`,
      });
    }
  } catch (emailErr: any) {
    logger.error({ err: emailErr }, 'Failed to send leave rejected email');
  }
};
