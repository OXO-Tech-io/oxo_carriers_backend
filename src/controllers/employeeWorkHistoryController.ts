import { Request, Response } from 'express';
import { employeeWorkHistoryService } from '../services/employeeWorkHistory.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok } from '../utils/response';
import { ListWorkHistoryQuery } from '../validators/employeeWorkHistory.validator';

export const listMine = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId, role } = req.user;
  const query = req.query as unknown as ListWorkHistoryQuery;
  const records = await employeeWorkHistoryService.list(userId, role, query.userId);
  ok(res, records, 'Work history records fetched');
};

export const getExperienceSummary = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { userId, role } = req.user;
  const query = req.query as unknown as ListWorkHistoryQuery;
  const summary = await employeeWorkHistoryService.getExperienceSummary(userId, role, query.userId);
  ok(res, summary, 'Experience summary calculated');
};
