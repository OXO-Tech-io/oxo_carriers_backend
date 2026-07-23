import { BadRequestException, Injectable } from '@nestjs/common';
import { EmployeeWelfareInfoModel } from '../../models/EmployeeWelfareInfo';
import { UserRole } from '../../types';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

/**
 * Read-only - mirrors the old employeeWelfareInfo.service.ts. There are no
 * direct write endpoints for welfare info; mutations only happen via the
 * profile-change-request approval workflow (see profileChangeRequest.service.ts).
 */
@Injectable()
export class EmployeeWelfareInfoService {
  async get(actorUserId: number, actorRole: UserRole, queryUserId?: number) {
    if (SELF_ROLES.includes(actorRole)) {
      return EmployeeWelfareInfoModel.findByUserId(actorUserId);
    }
    if (!queryUserId) {
      throw new BadRequestException('userId query parameter is required for HR/admin views');
    }
    return EmployeeWelfareInfoModel.findByUserId(queryUserId);
  }
}
