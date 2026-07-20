import { Request, Response } from 'express';
import { EmployeeModel } from '../models/Employee';
import { NotFoundError, UnauthorizedError } from '../utils/AppError';
import { ok } from '../utils/response';

/**
 * GET /api/auth/me
 *
 * Returns the DB user profile linked to the Keycloak token attached by the
 * `authenticate` middleware. Identity, password resets, email verification,
 * and registration are all owned by Keycloak.
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  if (!req.employee) throw new UnauthorizedError();
  const user = await EmployeeModel.findById(req.employee.userId);
  if (!user) throw new NotFoundError('User not found');
  ok(res, user, 'Current user');
};
