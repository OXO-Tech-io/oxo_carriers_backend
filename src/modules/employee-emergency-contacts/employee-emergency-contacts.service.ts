import { BadRequestException, Injectable } from '@nestjs/common';
import { EmployeeEmergencyContactModel } from '../../models/EmployeeEmergencyContact';
import { UserRole } from '../../types';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

/**
 * Read-only - mirrors the old employeeEmergencyContact.service.ts. There are
 * no direct write endpoints for emergency contact records; mutations only
 * happen via the profile-change-request approval workflow (see
 * profileChangeRequest.service.ts).
 */
@Injectable()
export class EmployeeEmergencyContactsService {
  async list(actorEmployeeId: string | null, actorRole: UserRole, queryEmployeeId?: string) {
    if (SELF_ROLES.includes(actorRole)) {
      if (!actorEmployeeId) {
        throw new BadRequestException('Employee record is missing an employeeId');
      }
      return EmployeeEmergencyContactModel.listByEmployeeId(actorEmployeeId);
    }
    if (!queryEmployeeId) {
      throw new BadRequestException('employeeId query parameter is required for HR/admin views');
    }
    return EmployeeEmergencyContactModel.listByEmployeeId(queryEmployeeId);
  }
}
