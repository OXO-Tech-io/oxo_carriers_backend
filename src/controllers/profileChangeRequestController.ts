import { Request, Response } from 'express';
import { profileChangeRequestService } from '../services/profileChangeRequest.service';
import { EmployeeModel } from '../models/Employee';
import { UserRole } from '../types';
import { UnauthorizedError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import {
  DecideProfileChangeRequestInput,
  ListProfileChangeRequestsQuery,
  ProfileChangeItem,
  ProfileChangeRequestIdParam,
  SubmitProfileChangeRequestInput,
} from '../validators/profileChangeRequest.validator';
import {
  sendProfileChangeSubmittedEmail,
  sendProfileChangeApprovedEmail,
  sendProfileChangeRejectedEmail,
  sendProfileChangeReturnedEmail,
} from '../config/email';
import { logger } from '../lib/logger';

const requireUser = (req: Request) => {
  if (!req.employee) throw new UnauthorizedError();
  return req.employee;
};

export const submit = async (req: Request, res: Response) => {
  const { userId } = requireUser(req);
  const input = req.body as SubmitProfileChangeRequestInput;
  const request = await profileChangeRequestService.submitChangeRequest(userId, input);
  created(res, request, 'Profile change request submitted');

  try {
    const employee = await EmployeeModel.findById(userId);
    const hrUsers = await EmployeeModel.getAll({ role: [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE] });
    if (employee) {
      const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
      const changesSummary = profileChangeRequestService.summarizeChanges(input.changes as ProfileChangeItem[]);
      await Promise.all(
        hrUsers.map(hr =>
          sendProfileChangeSubmittedEmail(hr.email, {
            employeeName,
            changesSummary,
            submittedDate: new Date().toLocaleDateString('en-GB'),
            referenceNumber: `PCR-${request.id}`,
            ctaUrl: undefined,
          })
        )
      );
    }
  } catch (emailErr: any) {
    logger.error({ err: emailErr }, 'Failed to send profile change submitted email');
  }
};

export const list = async (req: Request, res: Response) => {
  const { userId, role } = requireUser(req);
  const query = req.query as unknown as ListProfileChangeRequestsQuery;
  const requests = await profileChangeRequestService.listRequests(userId, role, query);
  ok(res, requests, 'Profile change requests fetched');
};

export const getById = async (req: Request, res: Response) => {
  const { userId, role } = requireUser(req);
  const { id } = req.params as unknown as ProfileChangeRequestIdParam;
  const request = await profileChangeRequestService.getRequestById(id, userId, role);
  ok(res, request, 'Profile change request fetched');
};

const decideAndNotify = async (
  req: Request,
  res: Response,
  decision: 'approved' | 'rejected' | 'returned_for_modification'
) => {
  const { userId, role } = requireUser(req);
  const { id } = req.params as unknown as ProfileChangeRequestIdParam;
  const { reviewerComments } = req.body as DecideProfileChangeRequestInput;
  const updated = await profileChangeRequestService.decide(id, userId, role, decision, reviewerComments);
  ok(res, updated, 'Profile change request updated');

  try {
    const employee = await EmployeeModel.findById(updated.userId);
    if (employee) {
      const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
      const changesSummary = profileChangeRequestService.summarizeChanges(
        (updated.changes as ProfileChangeItem[]) ?? []
      );
      const params = {
        employeeName,
        changesSummary,
        decidedDate: new Date().toLocaleDateString('en-GB'),
        reviewerComments: reviewerComments ?? undefined,
        referenceNumber: `PCR-${updated.id}`,
      };
      if (decision === 'approved') {
        await sendProfileChangeApprovedEmail(employee.email, params);
      } else if (decision === 'rejected') {
        await sendProfileChangeRejectedEmail(employee.email, params);
      } else {
        await sendProfileChangeReturnedEmail(employee.email, params);
      }
    }
  } catch (emailErr: any) {
    logger.error({ err: emailErr }, `Failed to send profile change ${decision} email`);
  }
};

export const decide = (req: Request, res: Response) => {
  const { decision } = req.body as DecideProfileChangeRequestInput;
  return decideAndNotify(req, res, decision);
};
