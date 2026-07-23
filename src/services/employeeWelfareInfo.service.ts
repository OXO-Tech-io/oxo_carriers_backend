import { EmployeeWelfareInfoModel } from '../models/EmployeeWelfareInfo';
import { UserRole } from '../types';
import { BadRequestError } from '../utils/AppError';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

export const employeeWelfareInfoService = {
  async get(actorUserId: number, actorRole: UserRole, queryUserId?: number) {
    if (SELF_ROLES.includes(actorRole)) {
      return EmployeeWelfareInfoModel.findByUserId(actorUserId);
    }
    if (!queryUserId) {
      throw new BadRequestError('userId query parameter is required for HR/admin views');
    }
    return EmployeeWelfareInfoModel.findByUserId(queryUserId);
  },
};
