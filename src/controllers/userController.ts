import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { UserRole } from '../types';
import pool from '../config/database';
import crypto from 'crypto';
import { sendPasswordSetupEmail, sendEmailVerificationEmail } from '../config/email';
import { calculateProRatedAnnualLeave } from '../utils/leaveCalculation';

// Store password reset tokens (in production, use Redis or database)
const passwordResetTokens = new Map<string, { userId: number; expiresAt: Date }>();

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

    // Employees can only view their own profile, HR can view any
    if (req.user?.role === UserRole.EMPLOYEE && req.user.userId !== userId) {
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
    // HR Manager and HR Executive can create users
    if (req.user?.role !== UserRole.HR_MANAGER && req.user?.role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR Manager and HR Executive can create users' });
    }

    const {
      email,
      password,
      first_name,
      last_name,
      role,
      department,
      position,
      hire_date,
      manager_id
    } = req.body;

    if (!email || !first_name || !last_name) {
      return res.status(400).json({ success: false, message: 'Required fields are missing' });
    }

    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const employeeId = await UserModel.generateEmployeeId();
    const userRole = (role as UserRole) || UserRole.EMPLOYEE;

    // Generate a temporary password (will be changed on first login)
    const tempPassword = password || crypto.randomBytes(12).toString('base64').slice(0, 12);
    
    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await UserModel.create({
      employee_id: employeeId,
      email,
      password: tempPassword,
      first_name,
      last_name,
      role: userRole,
      department,
      position,
      hire_date: hire_date ? new Date(hire_date) : undefined,
      manager_id: manager_id ? parseInt(manager_id) : undefined,
      email_verification_token: verificationToken
    });

    // Initialize leave balances for the year
    const currentYear = new Date().getFullYear();
    const [leaveTypes] = await pool.execute('SELECT id, name, max_days FROM leave_types WHERE is_active = true');
    const types = leaveTypes as any[];

    // Get user's hire date for pro-rated calculation
    const hireDate = user.hire_date ? new Date(user.hire_date) : new Date();

    for (const type of types) {
      let totalDays = type.max_days;
      
      // Apply pro-rated calculation for Annual leave in the first year
      if (type.name.toLowerCase() === 'annual' || type.name.toLowerCase() === 'annual/paid leave') {
        totalDays = calculateProRatedAnnualLeave(hireDate, currentYear);
      }

      await pool.execute(
        'INSERT INTO employee_leave_balance (user_id, leave_type_id, total_days, used_days, remaining_days, year) VALUES (?, ?, ?, 0, ?, ?)',
        [user.id, type.id, totalDays, totalDays, currentYear]
      );
    }


    // Generate password setup token and send emails
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 days
    passwordResetTokens.set(resetToken, { userId: user.id, expiresAt });

    try {
      // Send email verification email
      await sendEmailVerificationEmail(email, verificationToken, first_name);
      
      // Send password setup email
      await sendPasswordSetupEmail(email, resetToken, first_name, employeeId);
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Don't fail the request if email fails
    }

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      message: 'User created successfully. Password setup email has been sent.',
      user: userWithoutPassword
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

    // Employees can only update their own profile (limited fields)
    if (req.user?.role === UserRole.EMPLOYEE && req.user.userId !== userId) {
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

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 days
    passwordResetTokens.set(resetToken, { userId: user.id, expiresAt });

    try {
      await sendPasswordSetupEmail(user.email, resetToken, user.first_name, user.employee_id);
      res.json({ 
        success: true, 
        message: 'Password reset email has been sent to the user' 
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
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
