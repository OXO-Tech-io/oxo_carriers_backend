import { EmployeeWorkHistoryModel } from '../models/EmployeeWorkHistory';
import { UserRole } from '../types';
import { BadRequestError } from '../utils/AppError';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

export const employeeWorkHistoryService = {
  async list(actorUserId: number, actorRole: UserRole, queryUserId?: number) {
    if (SELF_ROLES.includes(actorRole)) {
      return EmployeeWorkHistoryModel.listByUserId(actorUserId);
    }
    if (!queryUserId) {
      throw new BadRequestError('userId query parameter is required for HR/admin views');
    }
    return EmployeeWorkHistoryModel.listByUserId(queryUserId);
  },
};
