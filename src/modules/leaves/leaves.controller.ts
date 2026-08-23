import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, LeaveStatus, UserRole } from '../../types';
import { logger } from '../../lib/logger';
import { sendLeaveApprovedEmail, sendLeaveRejectedEmail, sendLeaveSubmittedEmail } from '../../config/email';
import { communicationService } from '../communications/communication.service';
import { EmployeeModel } from '../../employees/Employee';
import { LeavesService } from './leaves.service';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { ApproveLeaveRequestDto } from './dto/approve-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';
import { CoverageCandidatesQueryDto } from './dto/coverage-candidates-query.dto';
import { DOCUMENT_FIELD, leaveDocumentMulterOptions } from './leaves.upload';

// Dual-mounted to match the old Express app.ts, which serves this router at
// both '/api/leaves' and the legacy bare '/leaves'.
@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Get(':employeeId/balances')
  async getLeaveBalance(
    @CurrentEmployee() employee: JwtPayload,
    @Param('employeeId') employeeId: string,
    @Query() query: LeaveBalanceQueryDto,
  ) {
    const balances = await this.leavesService.getLeaveBalance(employee, employeeId, query);
    return { success: true, message: 'Leave balance fetched', data: balances };
  }

  @Get()
  async getLeaveRequests(@CurrentEmployee() employee: JwtPayload, @Query() query: ListLeaveRequestsQueryDto) {
    const requests = await this.leavesService.listLeaveRequests(employee, query);
    return { success: true, message: 'Leave requests fetched', data: requests };
  }

  /** Must be declared before @Get(':id') so it isn't shadowed by that route. */
  @Get('coverage-candidates')
  async getCoverageCandidates(
    @CurrentEmployee() employee: JwtPayload,
    @Query() query: CoverageCandidatesQueryDto,
  ) {
    const candidates = await this.leavesService.listCoverageCandidates(employee, query);
    return { success: true, message: 'Coverage candidates fetched', data: candidates };
  }

  @Get(':id')
  async getLeaveRequestById(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const request = await this.leavesService.getLeaveRequestById(employee, id);
    return { success: true, message: 'Leave request fetched', data: request };
  }

  @Post()
  @UseInterceptors(FileInterceptor(DOCUMENT_FIELD, leaveDocumentMulterOptions))
  async createLeaveRequest(
    @CurrentEmployee() employee: JwtPayload,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const request = await this.leavesService.createLeaveRequest(employee, body, file);

    // Confirmation email to the employee (non-blocking, matches the original
    // leaveController.createLeaveRequest).
    this.notifySubmitted(request).catch((emailErr: unknown) => {
      logger.error({ err: emailErr }, 'Failed to send leave submitted email');
    });

    return { success: true, message: 'Leave request created', data: request };
  }

  @Put(':id/approvals')
  async approveLeaveRequest(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: ApproveLeaveRequestDto,
  ) {
    const id = this.parseId(idParam);
    const updated = await this.leavesService.approveLeaveRequest(employee, id, dto);

    this.notifyApproved(updated, dto.approvedBy).catch((emailErr: unknown) => {
      logger.error({ err: emailErr }, 'Failed to send leave approved email');
    });

    // Only once the leave is finally confirmed (HR approval) - not on the
    // intermediate team-leader-approval step, since HR could still reject it.
    if (updated.status === LeaveStatus.HR_APPROVED && updated.coverup_employee_id) {
      this.notifyCoverupEmployee(updated, employee.userId).catch((err: unknown) => {
        logger.error({ err }, 'Failed to notify coverup employee');
      });
    }

    return { success: true, message: 'Leave request updated', data: updated };
  }

  @Put(':id/rejections')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  async rejectLeaveRequest(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: RejectLeaveRequestDto,
  ) {
    const id = this.parseId(idParam);
    const updated = await this.leavesService.rejectLeaveRequest(employee, id, dto);

    this.notifyRejected(updated, dto.rejectionReason).catch((emailErr: unknown) => {
      logger.error({ err: emailErr }, 'Failed to send leave rejected email');
    });

    return { success: true, message: 'Leave request rejected', data: updated };
  }

  private parseId(idParam: string): number {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid leave request id');
    return id;
  }

  private async notifySubmitted(request: Awaited<ReturnType<LeavesService['createLeaveRequest']>>) {
    const employeeName = request.user ? `${request.user.first_name} ${request.user.last_name}`.trim() : 'Employee';
    const employeeEmail = request.user?.email;
    if (!employeeEmail) return;
    await sendLeaveSubmittedEmail(employeeEmail, {
      employeeName,
      leaveType: request.leave_type?.name ?? 'Leave',
      startDate: new Date(request.start_date).toLocaleDateString('en-GB'),
      endDate: new Date(request.end_date).toLocaleDateString('en-GB'),
      totalDays: request.total_days,
      reason: request.reason ?? undefined,
      submittedDate: new Date().toLocaleDateString('en-GB'),
      referenceNumber: `LV-${request.id}`,
    });
  }

  private async notifyApproved(
    updated: Awaited<ReturnType<LeavesService['approveLeaveRequest']>>,
    approvedBy: 'team_leader' | 'hr',
  ) {
    const employeeName = updated.user ? `${updated.user.first_name} ${updated.user.last_name}`.trim() : 'Employee';
    const employeeEmail = updated.user?.email;
    if (!employeeEmail) return;
    await sendLeaveApprovedEmail(employeeEmail, {
      employeeName,
      leaveType: updated.leave_type?.name ?? 'Leave',
      startDate: new Date(updated.start_date).toLocaleDateString('en-GB'),
      endDate: new Date(updated.end_date).toLocaleDateString('en-GB'),
      totalDays: updated.total_days,
      approvedDate: new Date().toLocaleDateString('en-GB'),
      approvedBy: approvedBy === 'team_leader' ? 'Team Leader' : 'HR Management',
      referenceNumber: `LV-${updated.id}`,
    });
  }

  /**
   * Notifies the coverup employee once a leave request is finally HR-approved
   * - see the `LeaveStatus.HR_APPROVED` gate at the call site. Goes through
   * communicationService.create (the same path HR broadcasts use) rather than
   * the generic notificationService directly, so this actually shows up in
   * the recipient's My Communications inbox - not just the notification bell
   * - since communicationService.create already fires both the in-app
   * notification and an email per recipient as part of creating the
   * communication. Silently no-ops if the coverup employee's record can't be
   * found (shouldn't happen: leave.service.ts validates it exists at request time).
   */
  private async notifyCoverupEmployee(
    updated: Awaited<ReturnType<LeavesService['approveLeaveRequest']>>,
    approverUserId: number,
  ) {
    if (!updated.coverup_employee_id) return;

    const coverupEmployee = await EmployeeModel.findByEmployeeId(updated.coverup_employee_id);
    if (!coverupEmployee) return;

    const coveredEmployeeName = updated.user
      ? `${updated.user.first_name} ${updated.user.last_name}`.trim()
      : 'A colleague';
    const startDate = new Date(updated.start_date).toLocaleDateString('en-GB');
    const endDate = new Date(updated.end_date).toLocaleDateString('en-GB');

    await communicationService.create(
      'Coverup Assignment',
      `${coveredEmployeeName}'s leave (${startDate} - ${endDate}) has been approved. You have been assigned to cover their work during this period.`,
      [coverupEmployee.id],
      [],
      approverUserId,
      [],
    );
  }

  private async notifyRejected(
    updated: Awaited<ReturnType<LeavesService['rejectLeaveRequest']>>,
    rejectionReason: string | undefined,
  ) {
    const employeeName = updated.user ? `${updated.user.first_name} ${updated.user.last_name}`.trim() : 'Employee';
    const employeeEmail = updated.user?.email;
    if (!employeeEmail) return;
    await sendLeaveRejectedEmail(employeeEmail, {
      employeeName,
      leaveType: updated.leave_type?.name ?? 'Leave',
      startDate: new Date(updated.start_date).toLocaleDateString('en-GB'),
      endDate: new Date(updated.end_date).toLocaleDateString('en-GB'),
      totalDays: updated.total_days,
      rejectionReason: rejectionReason ?? 'No reason provided.',
      referenceNumber: `LV-${updated.id}`,
    });
  }
}
