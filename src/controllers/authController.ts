import { Request, Response } from 'express';
import { EmployeeModel } from '../models/User';
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
  if (!req.employee) throw new UnauthorizedError();
  const user = await EmployeeModel.findById(req.employee.userId);
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

    const user = await EmployeeModel.findByVerificationToken(token);
    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired verification token.' });
      return;
    }

    // Mark email verified in DB
    await EmployeeModel.verifyEmail(user.id);

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

    const user = await EmployeeModel.findByVerificationToken(token);
    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired token.' });
      return;
    }

    // 1. Ensure email is verified in DB
    await EmployeeModel.verifyEmail(user.id);

    // 3. Update or Provision in Keycloak
    let keycloakSub = user.keycloakSub;
    let keycloakSynced = false;
    let keycloakError: string | null = null;

    if (keycloakSub) {
      try {
        // Update password in Keycloak
        await keycloakAdminService.updatePassword(keycloakSub, targetPassword);
        // Mark email verified in Keycloak
        await keycloakAdminService.verifyEmail(keycloakSub);
        keycloakSynced = true;
      } catch (kcError: any) {
        req.log?.error({ err: kcError, userId: user.id }, 'Keycloak resetPassword sync failed');
        keycloakError = kcError.message;
      }
    } else {
      // User is not in Keycloak yet (provisioning failed during user creation or was deferred)
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
        await EmployeeModel.linkKeycloakSub(user.id, keycloakSub);
        await keycloakAdminService.verifyEmail(keycloakSub);
        keycloakSynced = true;
      } catch (kcError: any) {
        req.log?.error({ err: kcError, userId: user.id }, 'Keycloak provisioning during password reset failed');
        keycloakError = kcError.message;
      }
    }

    res.json({
      success: true,
      message: keycloakSynced
        ? 'Password has been set successfully!'
        : 'Password has been set successfully in the database. Note: Keycloak synchronization was deferred.',
      keycloakSynced,
      keycloakError,
    });
  } catch (error: any) {
    req.log?.error({ err: error }, 'Reset password endpoint failed');
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};
