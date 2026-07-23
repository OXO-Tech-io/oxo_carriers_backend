import { Injectable } from '@nestjs/common';
import { leaveService } from '../../services/leave.service';
import { createLeaveRequestSchema } from '../../validators/leave.validator';
import { JwtPayload } from '../../types';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { ApproveLeaveRequestDto } from './dto/approve-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';

/**
 * Thin wrapper around the existing `leaveService` (src/services/leave.service.ts),
 * which already contains all validation/permission logic and throws AppError
 * subclasses (BadRequestError/ForbiddenError/NotFoundError) - the shared
 * AllExceptionsFilter (src/common/filters/all-exceptions.filter.ts) already
 * handles AppError identically to a NestJS HttpException (same status code +
 * message + { success: false, message } shape), so that logic is reused as-is
 * rather than re-implemented with Nest exception classes.
 */
@Injectable()
export class LeavesService {
  async getLeaveTypes() {
    return leaveService.getLeaveTypes();
  }

  async getLeaveBalance(userId: number, query: LeaveBalanceQueryDto) {
    return leaveService.getLeaveBalance(userId, query);
  }

  async listLeaveRequests(employee: JwtPayload, query: ListLeaveRequestsQueryDto) {
    return leaveService.listLeaveRequests(employee.userId, employee.role, query);
  }

  async getLeaveRequestById(employee: JwtPayload, id: number) {
    return leaveService.getLeaveRequestById(id, employee.userId, employee.role);
  }

  /**
   * `createLeaveRequestSchema` has cross-field `.refine` rules (half-day leave
   * requires start_date === end_date, and half_day_period is required when
   * is_half_day is true) - not translated to class-validator per the task
   * instructions; kept as raw Zod validation here. A thrown ZodError
   * propagates to the global AllExceptionsFilter, which already formats it
   * the same way a DTO validation failure would be.
   */
  async createLeaveRequest(employee: JwtPayload, body: unknown, file: Express.Multer.File | undefined) {
    const input = createLeaveRequestSchema.parse(body);
    const attachmentUrl = file ? `/uploads/documents/${file.filename}` : undefined;
    return leaveService.createLeaveRequest(employee.userId, input, attachmentUrl);
  }

  async approveLeaveRequest(employee: JwtPayload, id: number, dto: ApproveLeaveRequestDto) {
    return leaveService.approveLeaveRequest(id, employee.userId, employee.role, dto.approvedBy, dto.rejectionReason);
  }

  /**
   * The original route applied `requireHR` middleware ahead of the handler
   * (HR_MANAGER/HR_EXECUTIVE only, super_admin always bypasses) - replicated
   * declaratively via RolesGuard/@Roles on the controller method. leaveService
   * still carries its own internal role check too; with the guard in front it
   * is unreachable for non-HR callers, but it is left untouched since we are
   * not rewriting that service's logic.
   */
  async rejectLeaveRequest(employee: JwtPayload, id: number, dto: RejectLeaveRequestDto) {
    return leaveService.rejectLeaveRequest(id, employee.role, dto.rejectionReason);
  }
}
