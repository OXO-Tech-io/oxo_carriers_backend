import { BadRequestException, Injectable } from '@nestjs/common';
import { EmployeeEducationModel } from '../../models/EmployeeEducation';
import { UserRole } from '../../types';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

/**
 * Read-only - mirrors the old employeeEducation.service.ts. There are no
 * direct write endpoints for education records; mutations only happen via
 * the profile-change-request approval workflow (see profileChangeRequest.service.ts).
 */
@Injectable()
export class EmployeeEducationService {
  async list(actorUserId: number, actorRole: UserRole, queryUserId?: number) {
    if (SELF_ROLES.includes(actorRole)) {
      return EmployeeEducationModel.listByUserId(actorUserId);
    }
    if (!queryUserId) {
      throw new BadRequestException('userId query parameter is required for HR/admin views');
    }
    return EmployeeEducationModel.listByUserId(queryUserId);
  }
}
