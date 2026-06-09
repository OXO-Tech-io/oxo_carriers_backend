import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { NotFoundError, UnauthorizedError } from '../utils/AppError';
import { ok } from '../utils/response';
import { keycloakAdminService } from '../services/keycloakAdmin.service';
import { UserRole } from '../types';

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

/**
 * GET /api/auth/verify-email
 *
 * Verifies user's email using verification token.
 */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }

    const user = await UserModel.findByVerificationToken(token);
    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired verification token.' });
      return;
    }

    // Mark email verified in DB
    await UserModel.verifyEmail(user.id);

    // Sync verification status to Keycloak if they have a Keycloak account
    if (user.keycloakSub) {
      try {
        await keycloakAdminService.verifyEmail(user.keycloakSub);
      } catch (kcError: any) {
        req.log?.error({ err: kcError, userId: user.id }, 'Keycloak verifyEmail sync failed');
      }
    }

    res.json({ success: true, message: 'Email verified successfully!' });
  } catch (error: any) {
    req.log?.error({ err: error }, 'Verify email endpoint failed');
    res.status(500).json({ success: false, message: 'Failed to verify email', error: error.message });
  }
};

/**
 * POST /api/auth/reset-password
 *
 * Sets password for user using verification/reset token.
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword, password } = req.body;
    const targetPassword = newPassword || password;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }

    if (!targetPassword || typeof targetPassword !== 'string' || targetPassword.length < 8) {
      res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
      return;
    }

    const user = await UserModel.findByVerificationToken(token);
    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired token.' });
      return;
    }

    // 1. Update password in the database (which also updates mustChangePassword to false)
    await UserModel.updatePassword(user.id, targetPassword);

    // 2. Also ensure email is verified in DB
    await UserModel.verifyEmail(user.id);

    // 3. Update or Provision in Keycloak
    let keycloakSub = user.keycloakSub;
    if (keycloakSub) {
      try {
        // Update password in Keycloak
        await keycloakAdminService.updatePassword(keycloakSub, targetPassword);
        // Mark email verified in Keycloak
        await keycloakAdminService.verifyEmail(keycloakSub);
      } catch (kcError: any) {
        req.log?.error({ err: kcError, userId: user.id }, 'Keycloak resetPassword sync failed');
        res.status(502).json({
          success: false,
          message: 'Password updated in database, but Keycloak synchronization failed.',
          error: kcError.message,
        });
        return;
      }
    } else {
      // User is not in Keycloak yet (provisioning failed during user creation)
      // Provision them now!
      try {
        keycloakSub = await keycloakAdminService.createUser({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          password: targetPassword,
          temporaryPassword: false, // User just typed this password, so it's not temporary
          role: user.role as UserRole,
        });
        await UserModel.linkKeycloakSub(user.id, keycloakSub);
        await keycloakAdminService.verifyEmail(keycloakSub);
      } catch (kcError: any) {
        req.log?.error({ err: kcError, userId: user.id }, 'Keycloak provisioning during password reset failed');
        res.status(502).json({
          success: false,
          message: 'Password updated in database, but failed to provision user in Keycloak.',
          error: kcError.message,
        });
        return;
      }
    }

    res.json({ success: true, message: 'Password has been set successfully!' });
  } catch (error: any) {
    req.log?.error({ err: error }, 'Reset password endpoint failed');
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};
