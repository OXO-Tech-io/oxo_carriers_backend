import { EmployeeNomineeModel } from '../models/EmployeeNominee';
import { UserRole } from '../types';
import { BadRequestError } from '../utils/AppError';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

export const employeeNomineeService = {
  async list(actorEmployeeId: string | null, actorRole: UserRole, queryEmployeeId?: string) {
    if (SELF_ROLES.includes(actorRole)) {
      if (!actorEmployeeId) {
        throw new BadRequestError('Employee record is missing an employeeId');
      }
      return EmployeeNomineeModel.listByEmployeeId(actorEmployeeId);
    }
    if (!queryEmployeeId) {
      throw new BadRequestError('employeeId query parameter is required for HR/admin views');
    }
    return EmployeeNomineeModel.listByEmployeeId(queryEmployeeId);
  },
};
