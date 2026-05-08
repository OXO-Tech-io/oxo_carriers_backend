import { Request, Response } from 'express';
import { UserModel } from '../models/User';
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
  if (!req.user) throw new UnauthorizedError();
  const user = await UserModel.findById(req.user.userId);
  if (!user) throw new NotFoundError('User not found');
  ok(res, user, 'Current user');
};
