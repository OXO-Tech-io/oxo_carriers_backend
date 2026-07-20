import { Request, Response } from 'express';
import { EmployeeModel } from '../models/Employee';
import { EmployeePiiModel } from '../models/EmployeePii';
import { UserRole } from '../types';
import { logger } from '../lib/logger';
import { isSuperAdmin } from '../middleware/auth';
import { db } from '../db';
import { employee as employeeTable, employeePii as employeePiiTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { keycloakAdminService } from '../services/keycloakAdmin.service';
import { generateSecureTemporaryPassword } from '../utils/password';

const log = (req: Request) => req.log ?? logger;
const VALID_ROLES = Object.values(UserRole);

export const getAllEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, department, search } = req.query;
    const employees = await EmployeeModel.getAll({
      role: role as UserRole,
      department: department as string,
      search: search as string
    });
    res.json({ success: true, employees });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get all employees failed');
    res.status(500).json({ success: false, message: 'Failed to fetch employees', error: error.message });
  }
};

export const getEmployeeByEmployeeId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const employee = await EmployeeModel.findByEmployeeId(employeeId as string);
    if (!employee) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    // Employees can only view their own profile; HR and Super Admin can view any
    const selfOnlyRoles = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];
    if (req.employee && selfOnlyRoles.includes(req.employee.role) && req.employee.userId !== employee.id) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    res.json({ success: true, employee });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get employee failed');
    res.status(500).json({ success: false, message: 'Failed to fetch employee', error: error.message });
  }
};

export const createEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const canCreate = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE];
    if (!req.employee?.role || (!isSuperAdmin(req) && !canCreate.includes(req.employee.role))) {
      res.status(403).json({ success: false, message: 'Only HR can create employees' });
      return;
    }

    const {
      employee_id,
      email,
      first_name,
      last_name,
      role,
      employee_type_id,
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

    if (!employee_id || !email || !first_name || !last_name) {
      res.status(400).json({ success: false, message: 'Missing required fields: employee_id, email, first_name, last_name' });
      return;
    }

    // Check if employee already exists
    const existingByEmail = await EmployeeModel.findByEmail(email);
    if (existingByEmail) {
      res.status(409).json({ success: false, message: 'Email already registered' });
      return;
    }

    const existingByEmpId = await EmployeeModel.findByEmployeeId(employee_id);
    if (existingByEmpId) {
      res.status(409).json({ success: false, message: 'Employee ID already registered' });
      return;
    }

    const newEmployee = await EmployeeModel.create({
      employee_id,
      email,
      first_name,
      last_name,
      role: role || UserRole.EMPLOYEE,
      employee_type_id: employee_type_id ? parseInt(employee_type_id) : null,
      department,
      position,
      hire_date: hire_date ? new Date(hire_date) : undefined,
      manager_id: manager_id ? parseInt(manager_id) : undefined,
      hourly_rate: hourly_rate ? parseFloat(hourly_rate) : null,
      bank_name,
      account_holder_name,
      account_number,
      bank_branch,
      company_name,
      contact_number,
    });

    // Auto-provision the employee in Keycloak so HR never has to do it as a
    // separate manual step. Best-effort: the employee record is already
    // created, so a Keycloak hiccup is reported back but doesn't roll back
    // the employee creation.
    let keycloakProvisioned = false;
    let keycloakError: string | null = null;
    try {
      const kcSub = await keycloakAdminService.createUser({
        email: newEmployee.email,
        firstName: newEmployee.firstName,
        lastName: newEmployee.lastName,
        password: generateSecureTemporaryPassword(),
        temporaryPassword: true,
        role: newEmployee.role as UserRole,
      });
      await EmployeeModel.linkKeycloakSub(newEmployee.id, kcSub);
      await keycloakAdminService.sendRequiredActionsEmail(kcSub, ['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
      keycloakProvisioned = true;
    } catch (kcError: any) {
      keycloakError = kcError.message;
      log(req).error({ err: kcError, employeeId: newEmployee.employeeId }, 'Keycloak auto-provisioning failed for new employee');
    }

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      employee: keycloakProvisioned ? await EmployeeModel.findById(newEmployee.id) : newEmployee,
      keycloakProvisioned,
      keycloakError,
    });
  } catch (error: any) {
    log(req).error({ err: error }, 'Create employee failed');
    res.status(500).json({ success: false, message: 'Failed to create employee', error: error.message });
  }
};

export const updateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const employee = await EmployeeModel.findByEmployeeId(employeeId as string);
    if (!employee) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    // Employees can only update their own profile (limited fields)
    const selfOnlyRoles = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];
    if (req.employee && selfOnlyRoles.includes(req.employee.role) && req.employee.userId !== employee.id) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const {
      first_name,
      last_name,
      department,
      position,
      manager_id,
      role
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
    if (canUpdateRole && role) {
      if (!VALID_ROLES.includes(role)) {
        res.status(400).json({ success: false, message: 'Invalid role' });
        return;
      }
      updates.role = role;
    }

    const updatedEmployee = await EmployeeModel.update(employee.id, updates);
    res.json({ success: true, message: 'Employee updated successfully', employee: updatedEmployee });
  } catch (error: any) {
    log(req).error({ err: error }, 'Update employee failed');
    res.status(500).json({ success: false, message: 'Failed to update employee', error: error.message });
  }
};

export const deleteEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    // Only HR Manager or super_admin can delete employees
    const canDelete = isSuperAdmin(req) || req.employee?.role === UserRole.HR_MANAGER;
    if (!canDelete) {
      res.status(403).json({ success: false, message: 'Only HR Manager or Super Admin can delete employees' });
      return;
    }

    const { employeeId } = req.params;
    const employee = await EmployeeModel.findByEmployeeId(employeeId as string);
    if (!employee) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    if (req.employee?.userId === employee.id) {
      res.status(400).json({ success: false, message: 'Cannot delete your own account' });
      return;
    }

    // Delete the PII row and the employee row atomically so we never end up
    // with an orphaned PII record if the second delete fails.
    await db.transaction(async (tx) => {
      await tx.delete(employeePiiTable).where(eq(employeePiiTable.employeeId, employeeId as string));
      await tx.delete(employeeTable).where(eq(employeeTable.id, employee.id));
    });

    // Best-effort Keycloak cleanup after the DB transaction has committed.
    if (employee.keycloakSub) {
      try {
        await keycloakAdminService.deleteUser(employee.keycloakSub);
      } catch (kcError: any) {
        log(req).error({ err: kcError, employeeId }, 'Failed to delete Keycloak user after employee deletion');
      }
    }

    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (error: any) {
    log(req).error({ err: error }, 'Delete employee failed');
    res.status(500).json({ success: false, message: 'Failed to delete employee', error: error.message });
  }
};
