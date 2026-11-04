import { BadRequestException, Body, ForbiddenException, Controller, Get, Param, Post, Put, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { profileChangeRequestService } from './profileChangeRequest.service';
import { DOCUMENTS_FIELD, DOCUMENTS_MAX_COUNT, profileChangeDocumentsMulterOptions } from './profile-change-requests.upload';
import { EmployeeModel } from '../../employees/Employee';
import { ON_BEHALF_SUBMITTER_ROLES, roleForStage, type ApprovalStage } from './approvalChain';
import { UserRole, JwtPayload } from '../../types';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  decideProfileChangeRequestSchema,
  listProfileChangeRequestsQuerySchema,
  profileChangeRequestIdParamSchema,
  submitProfileChangeRequestSchema,
  ProfileChangeItem,
} from '../../validators/profileChangeRequest.validator';
import {
  sendProfileChangeSubmittedEmail,
  sendProfileChangeApprovedEmail,
  sendProfileChangeRejectedEmail,
  sendProfileChangeReturnedEmail,
} from '../../config/email';
import { logger } from '../../lib/logger';

/**
 * Kept on raw Zod validation (schema.parse(...)) instead of class-validator
 * DTOs - profileChangeRequest.validator.ts's `profileChangeItemSchema` is a
 * discriminatedUnion with per-entityType superRefine cross-field rules
 * (structured address objects, composite bank_account objects, enum-gated
 * fields per entityType). That's not expressible in class-validator without
 * re-deriving the business rules by hand, which is too risky to attempt for
 * an approval workflow that gates real payroll/PII changes. A thrown
 * ZodError is already handled identically to a DTO validation failure by
 * the global AllExceptionsFilter.
 */
@Controller('profile-change-requests')
export class ProfileChangeRequestsController {
  // OCD-478: FilesInterceptor only kicks in for multipart/form-data requests
  // (i.e. once the caller actually attaches a document) - a plain JSON
  // submission with no files passes straight through untouched.
  @Post()
  @UseInterceptors(FilesInterceptor(DOCUMENTS_FIELD, DOCUMENTS_MAX_COUNT, profileChangeDocumentsMulterOptions))
  async submit(
    @Body() body: unknown,
    @CurrentEmployee() employee: JwtPayload,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    const input = submitProfileChangeRequestSchema.parse(body);
    // OCD-603/604: HR Manager / HR Executive / Administrator may raise a request
    // for another employee; everyone else can only change their own profile.
    let targetEmployeeId = employee.employeeId;
    if (input.targetEmployeeId && input.targetEmployeeId !== employee.employeeId) {
      if (!ON_BEHALF_SUBMITTER_ROLES.includes(employee.role)) {
        throw new ForbiddenException('You can only request changes to your own profile');
      }
      targetEmployeeId = input.targetEmployeeId;
    }
    const request = await profileChangeRequestService.submitChangeRequest(
      employee.userId,
      targetEmployeeId,
      input,
      files ?? [],
      employee.role,
    );

    this.notifySubmitted(request, input.changes as ProfileChangeItem[]).catch((emailErr: any) => {
      logger.error({ err: emailErr }, 'Failed to send profile change submitted email');
    });

    return { success: true, message: 'Profile change request submitted', data: request };
  }

  @Get()
  async list(@Query() query: unknown, @CurrentEmployee() employee: JwtPayload) {
    const parsedQuery = listProfileChangeRequestsQuerySchema.parse(query);
    const requests = await profileChangeRequestService.listRequests(employee.employeeId, employee.role, parsedQuery, employee.userId);
    return { success: true, message: 'Profile change requests fetched', data: requests };
  }

  @Get(':id')
  async getById(@Param() params: unknown, @CurrentEmployee() employee: JwtPayload) {
    const { id } = profileChangeRequestIdParamSchema.parse(params);
    const request = await profileChangeRequestService.getRequestById(id, employee.employeeId, employee.role, employee.userId);
    return { success: true, message: 'Profile change request fetched', data: request };
  }

  // A single noun-based endpoint for all decision outcomes (approved /
  // rejected / returned_for_modification), selected via `decision` in the
  // body rather than separate verb-named routes.
  // OCD-473: Profile Approvals (approve/reject/return) is restricted to
  // Administrator (super_admin, bypasses RolesGuard) and HR Manager only -
  // HR Executive no longer qualifies.
  @Put(':id/decisions')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROFILE_CHANGE_REQUESTS, 'write')
  decision(@Param() params: unknown, @Body() body: unknown, @CurrentEmployee() employee: JwtPayload) {
    return this.decideAndNotify(params, body, employee);
  }

  private async decideAndNotify(paramsRaw: unknown, bodyRaw: unknown, employee: JwtPayload) {
    const { id } = profileChangeRequestIdParamSchema.parse(paramsRaw);
    const { decision, reviewerComments } = decideProfileChangeRequestSchema.parse(bodyRaw);

    const updated = await profileChangeRequestService.decide(id, employee.userId, employee.role, decision, reviewerComments);

    // An intermediate approval (HR Manager -> Administrator) leaves the request
    // pending: tell the next approver instead of telling the employee it is done.
    const pending = updated.status === 'pending_approval';
    const notify = pending
      ? this.notifyStageReviewers(updated, (updated.changes as ProfileChangeItem[]) ?? [])
      : this.notifyDecided(updated, decision, reviewerComments);
    notify.catch((emailErr: any) => {
      logger.error({ err: emailErr }, `Failed to send profile change ${decision} email`);
    });

    return { success: true, message: 'Profile change request updated', data: updated };
  }

  // OCD-603/604/605: the submitted email goes to whoever owns the request's
  // first approval stage (HR Manager, or Administrator when an HR Manager raised it).
  private async notifySubmitted(
    request: { id: number; employeeId: string; approvalStage: string | null },
    changes: ProfileChangeItem[],
  ) {
    await this.notifyStageReviewers(request, changes);
  }

  private async notifyStageReviewers(
    request: { id: number; employeeId: string; approvalStage: string | null },
    changes: ProfileChangeItem[],
  ) {
    const employee = await EmployeeModel.findByEmployeeId(request.employeeId);
    if (!employee) return;
    const stage = (request.approvalStage ?? 'hr_manager') as ApprovalStage;
    const reviewers = await EmployeeModel.getAll({ role: [roleForStage(stage)] });
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const changesSummary = profileChangeRequestService.summarizeChanges(changes);
    await Promise.all(
      reviewers.map((hr) =>
        sendProfileChangeSubmittedEmail(hr.email, {
          employeeName,
          changesSummary,
          submittedDate: new Date().toLocaleDateString('en-GB'),
          referenceNumber: `PCR-${request.id}`,
          ctaUrl: undefined,
        }),
      ),
    );
  }

  private async notifyDecided(
    updated: { id: number; employeeId: string; changes: unknown },
    decision: 'approved' | 'rejected' | 'returned_for_modification',
    reviewerComments: string | undefined,
  ) {
    const employee = await EmployeeModel.findByEmployeeId(updated.employeeId);
    if (!employee) return;
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const changesSummary = profileChangeRequestService.summarizeChanges((updated.changes as ProfileChangeItem[]) ?? []);
    const params = {
      employeeName,
      changesSummary,
      decidedDate: new Date().toLocaleDateString('en-GB'),
      reviewerComments: reviewerComments ?? undefined,
      referenceNumber: `PCR-${updated.id}`,
    };
    if (decision === 'approved') {
      await sendProfileChangeApprovedEmail(employee.email, params);
    } else if (decision === 'rejected') {
      await sendProfileChangeRejectedEmail(employee.email, params);
    } else {
      await sendProfileChangeReturnedEmail(employee.email, params);
    }
  }
}
