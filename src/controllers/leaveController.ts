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
};
