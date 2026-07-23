import { BadRequestException, Injectable } from '@nestjs/common';
import { EmployeeWorkHistoryModel } from '../../models/EmployeeWorkHistory';
import { experienceSummaryService } from '../../services/experienceSummary.service';
import { UserRole } from '../../types';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

/**
 * Read-only - mirrors the old employeeWorkHistory.service.ts. There are no
 * direct write endpoints for work-history records; mutations only happen via
 * the profile-change-request approval workflow (see profileChangeRequest.service.ts).
 */
@Injectable()
export class EmployeeWorkHistoryService {
  async list(actorUserId: number, actorRole: UserRole, queryUserId?: number) {
    if (SELF_ROLES.includes(actorRole)) {
      return EmployeeWorkHistoryModel.listByUserId(actorUserId);
    }
    if (!queryUserId) {
      throw new BadRequestException('userId query parameter is required for HR/admin views');
    }
    return EmployeeWorkHistoryModel.listByUserId(queryUserId);
  }

  async getExperienceSummary(actorUserId: number, actorRole: UserRole, queryUserId?: number) {
    if (SELF_ROLES.includes(actorRole)) {
      return experienceSummaryService.calculate(actorUserId);
    }
    if (!queryUserId) {
      throw new BadRequestException('userId query parameter is required for HR/admin views');
    }
    return experienceSummaryService.calculate(queryUserId);
  }
}
