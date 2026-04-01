import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/User';
import { sendPasswordResetEmail } from '../config/email';
import { UserRole } from '../types';
import crypto from 'crypto';
import pool from '../config/database';

import { passwordResetTokens } from '../utils/tokenStore';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    console.log(`Login attempt for: ${email}`);

    const user = await UserModel.findByEmail(email);
    if (!user) {
      console.log(`❌ Login failed: User not found - ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.password) {
      console.log(`❌ Login failed: User has no password - ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isValidPassword = await UserModel.verifyPassword(password, user.password);
    if (!isValidPassword) {
      console.log(`❌ Login failed: Invalid password for ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    console.log(`✅ Login successful for: ${email} (${user.role})`);

    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      token,
      user: userWithoutPassword,
      mustChangePassword: user.must_change_password
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, first_name, last_name, role, department, position } = req.body;

    // Only HR Manager can register new users
    if ((req as any).user?.role !== UserRole.HR_MANAGER) {
      return res.status(403).json({ success: false, message: 'Only HR Manager can create users' });
    }

    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ success: false, message: 'Required fields are missing' });
    }

    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const employeeId = await UserModel.generateEmployeeId();
    const userRole = role || UserRole.EMPLOYEE;

    const user = await UserModel.create({
      employee_id: employeeId,
      email,
      password,
      first_name,
      last_name,
      role: userRole,
      department,
      position
    });

    // Note: User creation with email verification is handled in userController.createUser
    // This register endpoint is for HR Manager self-registration if needed

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userWithoutPassword
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
    }

    // Validate password complexity
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    const user = await UserModel.findById(userId);
    if (!user || !user.password) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isValidPassword = await UserModel.verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    await UserModel.updatePassword(userId, newPassword);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password', error: error.message });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return res.json({ success: true, message: 'If email exists, reset link has been sent' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    passwordResetTokens.set(resetToken, { userId: user.id, expiresAt });

    try {
      await sendPasswordResetEmail(email, resetToken, user.first_name);
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      return res.status(500).json({ success: false, message: 'Failed to send reset email' });
    }

    res.json({ success: true, message: 'If email exists, reset link has been sent' });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request', error: error.message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    const tokenData = passwordResetTokens.get(token);
    if (!tokenData) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }

    if (new Date() > tokenData.expiresAt) {
      passwordResetTokens.delete(token);
      return res.status(400).json({ success: false, message: 'Token has expired' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    await UserModel.updatePassword(tokenData.userId, newPassword);
    passwordResetTokens.delete(token);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Verification token is required' });
    }

    const user = await UserModel.findByVerificationToken(token);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
    }

    await UserModel.verifyEmail(user.id);

    res.json({ 
      success: true, 
      message: 'Email verified successfully. You can now log in.' 
    });
  } catch (error: any) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify email', error: error.message });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error: any) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user', error: error.message });
  }
};
