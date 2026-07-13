import { Request, Response } from 'express';
import { employeeEducationService } from '../services/employeeEducation.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok } from '../utils/response';
import { ListEducationQuery } from '../validators/employeeEducation.validator';

export const listMine = async (req: Request, res: Response) => {
  if (!req.employee) throw new UnauthorizedError();
  const { userId, role } = req.employee;
  const query = req.query as unknown as ListEducationQuery;
  const records = await employeeEducationService.list(userId, role, query.userId);
  ok(res, records, 'Education records fetched');
};
