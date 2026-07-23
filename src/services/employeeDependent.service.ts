import { EmployeeDependentModel } from '../models/EmployeeDependent';
import { UserRole } from '../types';
import { BadRequestError } from '../utils/AppError';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

export const employeeDependentService = {
  async list(actorEmployeeId: string | null, actorRole: UserRole, queryEmployeeId?: string) {
    if (SELF_ROLES.includes(actorRole)) {
      if (!actorEmployeeId) {
        throw new BadRequestError('Employee record is missing an employeeId');
      }
      return EmployeeDependentModel.listByEmployeeId(actorEmployeeId);
    }
    if (!queryEmployeeId) {
      throw new BadRequestError('employeeId query parameter is required for HR/admin views');
    }
    return EmployeeDependentModel.listByEmployeeId(queryEmployeeId);
  },
};
