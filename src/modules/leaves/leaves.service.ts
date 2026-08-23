import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { leaveService } from './leave.service';
import { LeaveModel } from './Leave';
import { createLeaveRequestSchema } from '../../validators/leave.validator';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeStatus, JwtPayload, UserRole } from '../../types';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { ApproveLeaveRequestDto } from './dto/approve-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';
import { CoverageCandidatesQueryDto } from './dto/coverage-candidates-query.dto';

const SELF_ONLY_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

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
  private requireEmployeeId(employee: JwtPayload): string {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    return employee.employeeId;
  }

  async getLeaveBalance(employee: JwtPayload, targetEmployeeId: string, query: LeaveBalanceQueryDto) {
    if (SELF_ONLY_ROLES.includes(employee.role) && employee.employeeId !== targetEmployeeId) {
      throw new ForbiddenException();
    }
    return leaveService.getLeaveBalance(targetEmployeeId, query);
  }

  async listLeaveRequests(employee: JwtPayload, query: ListLeaveRequestsQueryDto) {
    const employeeId = this.requireEmployeeId(employee);
    const requests = await leaveService.listLeaveRequests(employeeId, employee.role, query);

    // The Pending Approvals tab (status=pending, non-employee role) is for
    // reviewing OTHER people's leave - an approver's own pending request
    // would otherwise show up in their own approval queue, which reads as
    // self-approval. Excluded here rather than in the shared LeaveModel
    // query since other callers (e.g. the History tab) still want every
    // request, including the requester's own.
    if (query.status === 'pending' && employee.role !== UserRole.EMPLOYEE) {
      return requests.filter((request) => request.employee_id !== employeeId);
    }

    return requests;
  }

  async getLeaveRequestById(employee: JwtPayload, id: number) {
    return leaveService.getLeaveRequestById(id, this.requireEmployeeId(employee), employee.role);
  }

  /**
   * Any employee submitting their own leave request needs to browse active
   * colleagues to pick a coverup employee - GET /users is HR/Finance-only
   * (see UsersController.getAll), so this is a narrowly-scoped alternative
   * rather than loosening that endpoint's role guard.
   */
  async listCoverageCandidates(employee: JwtPayload, query: CoverageCandidatesQueryDto) {
    const requesterEmployeeId = this.requireEmployeeId(employee);
    const employees = await EmployeeModel.getAll();
    const activeColleagues = employees.filter(
      (e) => e.status === EmployeeStatus.ACTIVE && e.employeeId !== requesterEmployeeId,
    );

    // Only filter by availability once both ends of the range are known -
    // with no dates picked yet, every active colleague is still a valid pick.
    let onLeave = new Set<string>();
    if (query.startDate && query.endDate) {
      onLeave = await LeaveModel.findEmployeeIdsWithOverlappingLeave(
        activeColleagues.map((e) => e.employeeId).filter((id): id is string => !!id),
        query.startDate,
        query.endDate,
      );
    }

    return activeColleagues
      .filter((e) => !e.employeeId || !onLeave.has(e.employeeId))
      .map((e) => ({
        id: e.id,
        employee_id: e.employeeId,
        first_name: e.firstName,
        last_name: e.lastName,
        department: e.department,
      }));
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
    return leaveService.createLeaveRequest(this.requireEmployeeId(employee), input, attachmentUrl);
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
