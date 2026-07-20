import { Request, Response } from 'express';
import { EmployeePiiModel } from '../models/EmployeePii';
import { UserModel } from '../models/User';
import { UserRole } from '../types';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/AppError';
import { ok } from '../utils/response';

const SELF_ONLY_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

export const getEmployeePii = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new UnauthorizedError();

  const userId = Number(req.params.id);
  if (Number.isNaN(userId)) {
    throw new BadRequestError('Invalid user ID');
  }

  // Employees can only view their own PII; HR and Super Admin can view any.
  if (SELF_ONLY_ROLES.includes(req.user.role) && req.user.userId !== userId) {
    throw new ForbiddenError();
  }

  const user = await UserModel.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  if (!user.employeeId) {
    throw new BadRequestError('User does not have an employee ID');
  }

  const pii = await EmployeePiiModel.findByEmployeeId(user.employeeId);
  ok(res, pii, 'Employee PII fetched');
};
