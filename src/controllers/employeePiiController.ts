import { Request, Response } from 'express';
import { EmployeePiiModel } from '../models/EmployeePii';
import { UserModel } from '../models/User';
import { UserRole } from '../types';
import { logger } from '../lib/logger';

const log = (req: Request) => req.log ?? logger;

export const getEmployeePii = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: idParam } = req.params;
    const userId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);

    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    // Employees can only view their own PII; HR and Super Admin can view any
    const selfOnlyRoles = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];
    if (req.user && selfOnlyRoles.includes(req.user.role) && req.user.userId !== userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.employeeId) {
      res.status(400).json({ success: false, message: 'User does not have an employee ID' });
      return;
    }

    const pii = await EmployeePiiModel.findByEmployeeId(user.employeeId);
    res.json({ success: true, pii });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get employee PII failed');
    res.status(500).json({ success: false, message: 'Failed to fetch employee PII', error: error.message });
  }
};

export const upsertEmployeePii = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: idParam } = req.params;
    const userId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);

    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    // Employees can only edit their own PII; HR and Super Admin can edit any
    const selfOnlyRoles = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];
    if (req.user && selfOnlyRoles.includes(req.user.role) && req.user.userId !== userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.employeeId) {
      res.status(400).json({ success: false, message: 'User does not have an employee ID' });
      return;
    }

    const {
      passportNumber,
      nationalId,
      address,
      emergencyContactName,
      emergencyContactPhone,
    } = req.body;

    const pii = await EmployeePiiModel.upsert(user.employeeId, {
      passportNumber: passportNumber !== undefined ? passportNumber : undefined,
      nationalId: nationalId !== undefined ? nationalId : undefined,
      address: address !== undefined ? address : undefined,
      emergencyContactName: emergencyContactName !== undefined ? emergencyContactName : undefined,
      emergencyContactPhone: emergencyContactPhone !== undefined ? emergencyContactPhone : undefined,
    });

    res.json({ success: true, message: 'Employee PII details updated successfully', pii });
  } catch (error: any) {
    log(req).error({ err: error }, 'Upsert employee PII failed');
    res.status(500).json({ success: false, message: 'Failed to update employee PII', error: error.message });
  }
};
