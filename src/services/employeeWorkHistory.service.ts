import { EmployeeWorkHistoryModel } from '../models/EmployeeWorkHistory';
import { experienceSummaryService } from './experienceSummary.service';
import { UserRole } from '../types';
import { BadRequestError } from '../utils/AppError';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

export const employeeWorkHistoryService = {
  async list(actorEmployeeId: string | null, actorRole: UserRole, queryEmployeeId?: string) {
    if (SELF_ROLES.includes(actorRole)) {
      if (!actorEmployeeId) {
        throw new BadRequestError('Employee record is missing an employeeId');
      }
      return EmployeeWorkHistoryModel.listByEmployeeId(actorEmployeeId);
    }
    if (!queryEmployeeId) {
      throw new BadRequestError('employeeId query parameter is required for HR/admin views');
    }
    return EmployeeWorkHistoryModel.listByEmployeeId(queryEmployeeId);
  },

  async getExperienceSummary(actorEmployeeId: string | null, actorRole: UserRole, queryEmployeeId?: string) {
    if (SELF_ROLES.includes(actorRole)) {
      if (!actorEmployeeId) {
        throw new BadRequestError('Employee record is missing an employeeId');
      }
      return experienceSummaryService.calculate(actorEmployeeId);
    }
    if (!queryEmployeeId) {
      throw new BadRequestError('employeeId query parameter is required for HR/admin views');
    }
    return experienceSummaryService.calculate(queryEmployeeId);
  },
};
