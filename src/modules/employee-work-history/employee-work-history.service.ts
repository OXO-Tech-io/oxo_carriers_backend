import { BadRequestException, Injectable } from '@nestjs/common';
import { EmployeeWorkHistoryModel } from './EmployeeWorkHistory';
import { experienceSummaryService } from './experienceSummary.service';
import { UserRole } from '../../types';

const SELF_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

/**
 * Read-only - mirrors the old employeeWorkHistory.service.ts. There are no
 * direct write endpoints for work-history records; mutations only happen via
 * the profile-change-request approval workflow (see profileChangeRequest.service.ts).
 */
@Injectable()
export class EmployeeWorkHistoryService {
  async list(actorEmployeeId: string | null, actorRole: UserRole, queryEmployeeId?: string) {
    if (SELF_ROLES.includes(actorRole)) {
      if (!actorEmployeeId) {
        throw new BadRequestException('Employee record is missing an employeeId');
      }
      return EmployeeWorkHistoryModel.listByEmployeeId(actorEmployeeId);
    }
    if (!queryEmployeeId) {
      throw new BadRequestException('employeeId query parameter is required for HR/admin views');
    }
    return EmployeeWorkHistoryModel.listByEmployeeId(queryEmployeeId);
  }

  async getExperienceSummary(actorEmployeeId: string | null, actorRole: UserRole, queryEmployeeId?: string) {
    if (SELF_ROLES.includes(actorRole)) {
      if (!actorEmployeeId) {
        throw new BadRequestException('Employee record is missing an employeeId');
      }
      return experienceSummaryService.calculate(actorEmployeeId);
    }
    if (!queryEmployeeId) {
      throw new BadRequestException('employeeId query parameter is required for HR/admin views');
    }
    return experienceSummaryService.calculate(queryEmployeeId);
  }
}
