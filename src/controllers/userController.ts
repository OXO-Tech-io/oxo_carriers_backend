import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { UserRole } from '../types';
import pool from '../config/database';
import crypto from 'crypto';
import { sendPasswordSetupEmail, sendEmailVerificationEmail } from '../config/email';
import { calculateProRatedAnnualLeave } from '../utils/leaveCalculation';

import { passwordResetTokens } from '../utils/tokenStore';

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { role, department, search } = req.query;
    
    const users = await UserModel.getAll({
      role: role as UserRole,
      department: department as string,
      search: search as string
    });

    res.json({ success: true, users });
  } catch (error: any) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users', error: error.message });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = parseInt(id as string);

    // Employees, consultants, service providers can only view their own profile; HR can view any
    const selfOnlyRoles = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];
    if (req.user && selfOnlyRoles.includes(req.user.role) && req.user.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user', error: error.message });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    // Only HR can create users (employees, consultants, etc.). Finance can only create service providers via createServiceProvider.
    const canCreateUser = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE];
    if (!req.user?.role || !canCreateUser.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only HR can create employees. Finance can only create service providers via Create Service Provider.',
      });
    }

    const {
      employee_id,
      email,
      password,
      first_name,
      last_name,
      role,
      department,
      position,
      hire_date,
      manager_id,
      hourly_rate,
      bank_name,
      account_holder_name,
      account_number,
      bank_branch,
      company_name,
      contact_number,
    } = req.body;

    const userRoleInput = (role as UserRole) || UserRole.EMPLOYEE;
    // Service providers are created only via createServiceProvider; do not allow here
    if (userRoleInput === UserRole.SERVICE_PROVIDER) {
      return res.status(400).json({
        success: false,
        message: 'Service providers must be created via Create Service Provider.',
      });
    }

    const effectiveFirst = first_name;
    const effectiveLast = last_name;

    if (!email || !effectiveFirst || !effectiveLast) {
      return res.status(400).json({ success: false, message: 'Required fields are missing' });
    }

    if (role === UserRole.CONSULTANT && (hourly_rate == null || hourly_rate === '' || isNaN(parseFloat(hourly_rate)))) {
      return res.status(400).json({ success: false, message: 'Hourly rate is required for Consultant role' });
    }

    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    // Use provided employee_id or generate one automatically
    const employeeId = employee_id && employee_id.trim() !== '' 
      ? employee_id.trim() 
      : await UserModel.generateEmployeeId();

    // Check if employee_id already exists (if provided)
    if (employee_id && employee_id.trim() !== '') {
      const existingEmployee = await UserModel.findByEmployeeId(employeeId);
      if (existingEmployee) {
        return res.status(400).json({ success: false, message: 'Employee ID already exists' });
      }
    }

    const userRole = (role as UserRole) || UserRole.EMPLOYEE;

    const tempPassword = password || crypto.randomBytes(12).toString('base64').slice(0, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await UserModel.create({
      employee_id: employeeId,
      email,
      password: tempPassword,
      first_name: effectiveFirst,
      last_name: effectiveLast,
      role: userRole,
      department,
      position,
      hire_date: hire_date ? new Date(hire_date) : undefined,
      manager_id: manager_id ? parseInt(manager_id) : undefined,
      hourly_rate: role === UserRole.CONSULTANT && hourly_rate != null ? parseFloat(hourly_rate) : null,
      bank_name: bank_name || null,
      account_holder_name: account_holder_name || null,
      account_number: account_number || null,
      bank_branch: bank_branch || null,
      company_name: null,
      contact_number: null,
      email_verification_token: verificationToken,
    });

    // Initialize leave balances only for employee/hr (not consultant or service_provider)
    const isLeaveEligible = userRole === UserRole.EMPLOYEE || userRole === UserRole.HR_MANAGER || userRole === UserRole.HR_EXECUTIVE;
    if (isLeaveEligible) {
      const currentYear = new Date().getFullYear();
      const [leaveTypes] = await pool.execute('SELECT id, name, max_days FROM leave_types WHERE is_active = true');
      const types = leaveTypes as any[];

      const hireDate = user.hire_date ? new Date(user.hire_date) : new Date();

      for (const type of types) {
        let totalDays = type.max_days;
        if (type.name.toLowerCase() === 'annual' || type.name.toLowerCase() === 'annual/paid leave') {
          totalDays = calculateProRatedAnnualLeave(hireDate, currentYear);
        }
        await pool.execute(
          'INSERT INTO employee_leave_balance (user_id, leave_type_id, total_days, used_days, remaining_days, year) VALUES (?, ?, ?, 0, ?, ?)',
          [user.id, type.id, totalDays, totalDays, currentYear]
        );
      }
    }


    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 days
    passwordResetTokens.set(resetToken, { userId: user.id, expiresAt });

    try {
      console.log(`[UserController] 📨 New User Created. Sending verification email to ${email}...`);
      const verificationEmailResult = await sendEmailVerificationEmail(email, verificationToken, effectiveFirst);
      if (!verificationEmailResult) {
        console.error(`⚠️  Failed to send email verification email to ${email}`);
      }
      console.log(`[UserController] 📨 Sending password setup email to ${email}...`);
      const setupEmailResult = await sendPasswordSetupEmail(email, resetToken, effectiveFirst, employeeId);
      if (!setupEmailResult) {
        console.error(`⚠️  Failed to send password setup email to ${email}`);
      } else {
        console.log(`✅ Password setup email sent successfully to ${email}`);
      }
    } catch (emailError: any) {
      console.error('❌ Error sending emails:', emailError);
    }

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      message: 'User created successfully. Password setup email has been sent.',
      user: userWithoutPassword,
    });
  } catch (error: any) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user', error: error.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = parseInt(id as string);

    // Employees, consultants, service providers can only update their own profile (limited fields)
    const selfOnlyRoles = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];
    if (req.user && selfOnlyRoles.includes(req.user.role) && req.user.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const {
      first_name,
      last_name,
      department,
      position,
      manager_id
    } = req.body;

    const updates: any = {};
    if (first_name) updates.first_name = first_name;
    if (last_name) updates.last_name = last_name;
    if (department !== undefined) updates.department = department;
    if (position !== undefined) updates.position = position;
    if (manager_id !== undefined) updates.manager_id = manager_id ? parseInt(manager_id) : null;

    // Only HR can update role and other sensitive fields
    if (req.user?.role === UserRole.HR_MANAGER || req.user?.role === UserRole.HR_EXECUTIVE) {
      if (req.body.role) updates.role = req.body.role;
    }

    const user = await UserModel.update(userId, updates);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User updated successfully', user });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user', error: error.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    // Only HR Manager can delete users
    if ((req as any).user?.role !== UserRole.HR_MANAGER) {
      return res.status(403).json({ success: false, message: 'Only HR Manager can delete users' });
    }

    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = parseInt(id as string);

    if ((req as any).user.userId === userId) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    await UserModel.delete(userId);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user', error: error.message });
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    // HR Manager and HR Executive can reset passwords
    if (req.user?.role !== UserRole.HR_MANAGER && req.user?.role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can reset passwords' });
    }

    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = parseInt(id as string);

    console.log(`[UserController] 🔄 Admin initiating password reset for user ID: ${userId}`);
    const user = await UserModel.findById(userId);
    if (!user) {
      console.warn(`[UserController] ❌ User not found for ID: ${userId}`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.log(`[UserController] 👤 Found user: ${user.email} (${user.first_name})`);

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 days
    passwordResetTokens.set(resetToken, { userId: user.id, expiresAt });

    try {
      console.log(`[UserController] 📨 Calling sendPasswordSetupEmail...`);
      const emailResult = await sendPasswordSetupEmail(user.email, resetToken, user.first_name, user.employee_id);
      
      if (!emailResult) {
        console.error(`[UserController] ❌ Email service returned null/false for ${user.email}`);
        console.error(`⚠️  Failed to send password reset email to ${user.email}`);
        console.error('   Please check SMTP configuration in .env file');
        console.error('   Run "npm run test:email" to verify email configuration');
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to send reset email. Please check SMTP configuration.' 
        });
      }
      console.log(`✅ Password reset email sent successfully to ${user.email}`);
      res.json({ 
        success: true, 
        message: 'Password reset email has been sent to the user' 
      });
    } catch (emailError: any) {
      console.error('❌ Error sending password reset email:', emailError);
      console.error('   Error details:', emailError.message);
      res.status(500).json({ success: false, message: 'Failed to send reset email' });
    }
  } catch (error: any) {
    console.error('Reset user password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(
      'SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY department'
    );
    const departments = (rows as any[]).map(row => row.department);
    res.json({ success: true, departments });
  } catch (error: any) {
    console.error('Get departments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch departments', error: error.message });
  }
};
