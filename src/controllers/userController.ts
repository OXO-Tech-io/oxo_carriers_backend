import { Request, Response } from 'express';
import { EmployeeModel } from '../models/Employee';
import { UserRole } from '../types';
import pool from '../config/database';
import { calculateProRatedAnnualLeave } from '../utils/leaveCalculation';
import { isSuperAdmin } from '../middleware/auth';
import { keycloakAdminService } from '../services/keycloakAdmin.service';
import { generateSecureTemporaryPassword } from '../utils/password';
import { logger } from '../lib/logger';

const log = (req: Request) => req.log ?? logger;

/** All valid role values accepted by the API */
const VALID_ROLES: string[] = Object.values(UserRole);

/**
 * GET /users
 *
 * Returns the actual Keycloak-provisioned accounts (cross-referenced against
 * the local employee table by email), rather than re-querying the employee
 * table the way employeeController.getAllEmployees already does - otherwise
 * this endpoint is just a duplicate of that one.
 */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;

    const [kcUsers, employees] = await Promise.all([
      keycloakAdminService.listUsers({ search: search as string | undefined }),
      EmployeeModel.getAll({ search: search as string }),
    ]);

    const employeesByEmail = new Map(employees.map(e => [e.email.toLowerCase(), e]));

    const users = kcUsers.map(kc => {
      const employee = employeesByEmail.get(kc.email?.toLowerCase());
      return {
        keycloakId: kc.id,
        email: kc.email,
        firstName: kc.firstName,
        lastName: kc.lastName,
        enabled: kc.enabled,
        emailVerified: kc.emailVerified,
        requiredActions: kc.requiredActions ?? [],
        employee: employee ?? null,
      };
    });

    res.json({ success: true, users });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get all users failed');
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
    if (req.employee && selfOnlyRoles.includes(req.employee.role) && req.employee.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const user = await EmployeeModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get user failed');
    res.status(500).json({ success: false, message: 'Failed to fetch user', error: error.message });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    // Only HR (and super_admin) can create users; Finance can only create service providers via createServiceProvider.
    const canCreateUser = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE];
    if (!req.employee?.role || (!isSuperAdmin(req) && !canCreateUser.includes(req.employee.role))) {
      return res.status(403).json({
        success: false,
        message: 'Only HR can create employees. Finance can only create service providers via Create Service Provider.',
      });
    }

    const {
      employee_id,
      email,
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

    const existingUser = await EmployeeModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Generate unique employee ID if not provided
    const employeeId = employee_id
      ? employee_id.trim()
      : await EmployeeModel.generateEmployeeId();

    if (employee_id) {
      const existingEmployee = await EmployeeModel.findByEmployeeId(employeeId);
      if (existingEmployee) {
        return res.status(409).json({ success: false, message: 'Employee ID already registered' });
      }
    }

    const userRole = (role as UserRole) || UserRole.EMPLOYEE;

    const user = await EmployeeModel.create({
      employee_id: employeeId,
      email,
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
    });

    // Initialize leave balances only for employee/hr (not consultant or service_provider)
    const isLeaveEligible = userRole === UserRole.EMPLOYEE || userRole === UserRole.HR_MANAGER || userRole === UserRole.HR_EXECUTIVE;
    if (isLeaveEligible) {
      const currentYear = new Date().getFullYear();
      const leaveTypesResult = await pool.query('SELECT id, name, max_days FROM tbl_leave_types WHERE is_active = true');
      const types = leaveTypesResult.rows as any[];

      const hireDateVal = user.hireDate || (user as any).hire_date;
      const hireDate = hireDateVal ? new Date(hireDateVal) : new Date();

      for (const type of types) {
        let totalDays = type.max_days;
        if (
          type.name.toLowerCase() === 'annual' ||
          type.name.toLowerCase() === 'annual/paid leave' ||
          type.name.toLowerCase() === 'annual leave'
        ) {
          totalDays = calculateProRatedAnnualLeave(hireDate, currentYear);
        }
        await pool.query(
          'INSERT INTO tbl_employee_leave_balance (user_id, leave_type_id, total_days, used_days, remaining_days, year) VALUES ($1, $2, $3, 0, $4, $5)',
          [user.id, type.id, totalDays, totalDays, currentYear]
        );
      }
    }

    // Initialize default permissions for employee role
    if (userRole === UserRole.EMPLOYEE) {
      const defaultPermissions = [
        'dashboard',
        'leaves',
        'salaries',
        'facilities',
        'medical_claims',
        'reports',
      ];
      for (const permission of defaultPermissions) {
        await pool.query(
          `INSERT INTO tbl_user_permissions (user_id, permission_key, access_level)
           VALUES ($1, $2, $3)`,
          [user.id, permission, 'read']
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully in database.',
      user,
    });
  } catch (error: any) {
    log(req).error({ err: error }, 'Create user failed');
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
    if (req.employee && selfOnlyRoles.includes(req.employee.role) && req.employee.userId !== userId) {
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
    if (first_name) updates.firstName = first_name;
    if (last_name) updates.lastName = last_name;
    if (department !== undefined) updates.department = department;
    if (position !== undefined) updates.position = position;
    if (manager_id !== undefined) updates.managerId = manager_id ? parseInt(manager_id) : null;

    // Only HR and super_admin can update role
    const canUpdateRole =
      isSuperAdmin(req) ||
      req.employee?.role === UserRole.HR_MANAGER ||
      req.employee?.role === UserRole.HR_EXECUTIVE;
    if (canUpdateRole && req.body.role) {
      updates.role = req.body.role;
    }

    const user = await EmployeeModel.update(userId, updates);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User updated successfully', user });
  } catch (error: any) {
    log(req).error({ err: error }, 'Update user failed');
    res.status(500).json({ success: false, message: 'Failed to update user', error: error.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    // Only HR Manager or super_admin can delete users
    const canDelete = isSuperAdmin(req) || req.employee?.role === UserRole.HR_MANAGER;
    if (!canDelete) {
      return res.status(403).json({ success: false, message: 'Only HR Manager or Super Admin can delete users' });
    }

    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = parseInt(id as string);

    if (req.employee?.userId === userId) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const user = await EmployeeModel.findById(userId);
    await EmployeeModel.delete(userId);

    if (user?.keycloakSub) {
      try {
        await keycloakAdminService.deleteUser(user.keycloakSub);
      } catch (kcError: any) {
        log(req).error({ err: kcError, userId }, 'Failed to delete Keycloak user after user deletion');
      }
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    log(req).error({ err: error }, 'Delete user failed');
    res.status(500).json({ success: false, message: 'Failed to delete user', error: error.message });
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    // HR Manager, HR Executive, and super_admin can reset passwords
    const canReset =
      isSuperAdmin(req) ||
      req.employee?.role === UserRole.HR_MANAGER ||
      req.employee?.role === UserRole.HR_EXECUTIVE;
    if (!canReset) {
      return res.status(403).json({ success: false, message: 'Only HR or Super Admin can reset passwords' });
    }

    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = parseInt(id as string);

    log(req).info({ userId }, 'Admin initiating password reset');
    const user = await EmployeeModel.findById(userId);
    if (!user) {
      log(req).warn({ userId }, 'User not found for password reset');
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    log(req).debug({ email: user.email, firstName: user.firstName }, 'Found user');

    // Keycloak owns the password — it can't be reset from a DB token. If the
    // user was never provisioned in Keycloak there is nothing to reset against.
    if (!user.keycloakSub) {
      log(req).warn({ userId }, 'User has no Keycloak identity; cannot reset password');
      return res.status(409).json({
        success: false,
        message: 'User is not provisioned in Keycloak yet, so their password cannot be reset.',
      });
    }

    try {
      await keycloakAdminService.sendRequiredActionsEmail(user.keycloakSub, [
        'UPDATE_PASSWORD',
      ]);
      log(req).info({ email: user.email }, 'Keycloak password reset email sent');
      res.json({
        success: true,
        message: 'Password reset email has been sent to the user',
      });
    } catch (emailError: any) {
      log(req).error({ err: emailError }, 'Error sending Keycloak password reset email');
      res.status(502).json({
        success: false,
        message:
          'Failed to send reset email via Keycloak. Verify the realm SMTP settings are configured.',
      });
    }
  } catch (error: any) {
    log(req).error({ err: error }, 'Reset user password failed');
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT department FROM tbl_employee WHERE department IS NOT NULL ORDER BY department'
    );
    const departments = (result.rows as any[]).map(row => row.department);
    res.json({ success: true, departments });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get departments failed');
    res.status(500).json({ success: false, message: 'Failed to fetch departments', error: error.message });
  }
};

/**
 * PATCH /users/:id/role
 * Super Admin only — assign any role to any user (except self-demotion from super_admin).
 */
export const updateUserRole = async (req: Request, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Only Super Admin can change user roles' });
    }

    const { id: idParam } = req.params;
    const userId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);

    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Prevent super_admin from changing their own role (safety guard)
    if (req.employee?.userId === userId) {
      return res.status(400).json({ success: false, message: 'Cannot change your own role' });
    }

    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    const targetUser = await EmployeeModel.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const previousRole = targetUser.role;

    // Update role
    const updated = await EmployeeModel.update(userId, { role });
    if (!updated) {
      return res.status(500).json({ success: false, message: 'Failed to update role' });
    }

    log(req).info(
      { actorId: req.employee?.userId, targetUserId: userId, previousRole, newRole: role },
      'Super Admin changed user role',
    );

    res.json({
      success: true,
      message: `Role updated from '${previousRole}' to '${role}'`,
      user: { id: userId, previous_role: previousRole, new_role: role },
    });
  } catch (error: any) {
    log(req).error({ err: error }, 'Update user role failed');
    res.status(500).json({ success: false, message: 'Failed to update role', error: error.message });
  }
};

/**
 * POST /users/:id/keycloak
 *
 * Provisions user in Keycloak and sends a Keycloak-hosted email so they can
 * verify their address and set their own password (no local reset tokens).
 */
export const provisionKeycloakUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: idParam } = req.params;
    const userId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);

    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    const user = await EmployeeModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user.keycloakSub) {
      res.status(200).json({
        success: true,
        message: 'User is already provisioned in Keycloak.',
        keycloakSub: user.keycloakSub,
      });
      return;
    }

    const tempPassword = generateSecureTemporaryPassword();

    log(req).info({ userId, email: user.email }, 'Provisioning user in Keycloak...');

    const kcSub = await keycloakAdminService.createUser({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: tempPassword,
      temporaryPassword: true,
      role: user.role as UserRole,
    });

    await EmployeeModel.linkKeycloakSub(user.id, kcSub);
    log(req).info({ userId, kcSub }, 'Keycloak user provisioned and linked successfully.');

    let onboardingEmailSent = true;
    try {
      await keycloakAdminService.sendRequiredActionsEmail(kcSub, ['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
      log(req).info({ email: user.email }, 'Keycloak onboarding email sent');
    } catch (emailError: any) {
      onboardingEmailSent = false;
      log(req).error({ err: emailError }, 'Failed to send Keycloak onboarding email');
    }

    res.status(200).json({
      success: true,
      message: onboardingEmailSent
        ? 'User provisioned in Keycloak successfully. An onboarding email has been sent.'
        : 'User provisioned in Keycloak successfully, but the onboarding email could not be sent.',
      keycloakSub: kcSub,
      onboardingEmailSent,
    });
  } catch (error: any) {
    log(req).error({ err: error }, 'Keycloak provisioning failed');
    res.status(500).json({
      success: false,
      message: 'Failed to provision user in Keycloak',
      error: error.message,
    });
  }
};
