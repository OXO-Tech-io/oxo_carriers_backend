import { Request, Response } from 'express';
import { EmployeePiiModel } from '../models/EmployeePii';
import { EmployeeModel } from '../models/Employee';
import { UserRole } from '../types';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/AppError';
import { UserIdParam } from '../validators/employeePii.validator';

const SELF_ONLY_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

// Response shape ({ success, pii }, not the { success, data } envelope used
// elsewhere) matches what the frontend's profileService.getEmployeePii has
// always expected from this endpoint.
export const getByUserId = async (req: Request, res: Response) => {
  if (!req.employee) throw new UnauthorizedError();
  const { userId } = req.params as unknown as UserIdParam;
  if (SELF_ONLY_ROLES.includes(req.employee.role) && req.employee.userId !== userId) {
    throw new ForbiddenError();
  }
  const target = await EmployeeModel.findById(userId);
  if (!target) throw new NotFoundError('Employee not found');
  const pii = target.employeeId ? await EmployeePiiModel.findByEmployeeId(target.employeeId) : null;
  res.json({ success: true, pii });
};
