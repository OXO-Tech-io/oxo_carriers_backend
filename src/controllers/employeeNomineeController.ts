import { Request, Response } from 'express';
import { employeeNomineeService } from '../services/employeeNominee.service';
import { EmployeeModel } from '../models/Employee';
import { NotFoundError, UnauthorizedError } from '../utils/AppError';
import { ok } from '../utils/response';
import { EmployeeIdParam } from '../validators/employeeEducation.validator';

export const list = async (req: Request, res: Response) => {
  if (!req.employee) throw new UnauthorizedError();
  const { userId, role } = req.employee;
  const { employeeId } = req.params as unknown as EmployeeIdParam;
  const target = await EmployeeModel.findByEmployeeId(employeeId);
  if (!target) throw new NotFoundError('Employee not found');
  const records = await employeeNomineeService.list(userId, role, target.id);
  ok(res, records, 'Nominee records fetched');
};
