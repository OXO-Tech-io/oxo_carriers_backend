import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { profileChangeRequestService } from '../../services/profileChangeRequest.service';
import { EmployeeModel } from '../../models/Employee';
import { UserRole, JwtPayload } from '../../types';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
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
@Controller('api/profile-change-requests')
export class ProfileChangeRequestsController {
  @Post()
  async submit(@Body() body: unknown, @CurrentEmployee() employee: JwtPayload) {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    const input = submitProfileChangeRequestSchema.parse(body);
    const request = await profileChangeRequestService.submitChangeRequest(employee.userId, employee.employeeId, input);

    this.notifySubmitted(employee.userId, request, input.changes as ProfileChangeItem[]).catch((emailErr: any) => {
      logger.error({ err: emailErr }, 'Failed to send profile change submitted email');
    });

    return { success: true, message: 'Profile change request submitted', data: request };
  }

  @Get()
  async list(@Query() query: unknown, @CurrentEmployee() employee: JwtPayload) {
    const parsedQuery = listProfileChangeRequestsQuerySchema.parse(query);
    const requests = await profileChangeRequestService.listRequests(employee.employeeId, employee.role, parsedQuery);
    return { success: true, message: 'Profile change requests fetched', data: requests };
  }

  @Get(':id')
  async getById(@Param() params: unknown, @CurrentEmployee() employee: JwtPayload) {
    const { id } = profileChangeRequestIdParamSchema.parse(params);
    const request = await profileChangeRequestService.getRequestById(id, employee.employeeId, employee.role);
    return { success: true, message: 'Profile change request fetched', data: request };
  }

  // Aliases for /:id/decision - the frontend calls these dedicated paths
  // (sending { decision, reviewerComments } in the body, same as /decision)
  // rather than the generic decision endpoint. All four share the same
  // handler; the decision always comes from the body, not the URL.
  @Put(':id/decision')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  decision(@Param() params: unknown, @Body() body: unknown, @CurrentEmployee() employee: JwtPayload) {
    return this.decideAndNotify(params, body, employee);
  }

  @Put(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  approve(@Param() params: unknown, @Body() body: unknown, @CurrentEmployee() employee: JwtPayload) {
    return this.decideAndNotify(params, body, employee);
  }

  @Put(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  reject(@Param() params: unknown, @Body() body: unknown, @CurrentEmployee() employee: JwtPayload) {
    return this.decideAndNotify(params, body, employee);
  }

  @Put(':id/return')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  return_(@Param() params: unknown, @Body() body: unknown, @CurrentEmployee() employee: JwtPayload) {
    return this.decideAndNotify(params, body, employee);
  }

  private async decideAndNotify(paramsRaw: unknown, bodyRaw: unknown, employee: JwtPayload) {
    const { id } = profileChangeRequestIdParamSchema.parse(paramsRaw);
    const { decision, reviewerComments } = decideProfileChangeRequestSchema.parse(bodyRaw);

    const updated = await profileChangeRequestService.decide(id, employee.userId, employee.role, decision, reviewerComments);

    this.notifyDecided(updated, decision, reviewerComments).catch((emailErr: any) => {
      logger.error({ err: emailErr }, `Failed to send profile change ${decision} email`);
    });

    return { success: true, message: 'Profile change request updated', data: updated };
  }

  private async notifySubmitted(userId: number, request: { id: number }, changes: ProfileChangeItem[]) {
    const employee = await EmployeeModel.findById(userId);
    const hrUsers = await EmployeeModel.getAll({ role: [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE] });
    if (!employee) return;
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const changesSummary = profileChangeRequestService.summarizeChanges(changes);
    await Promise.all(
      hrUsers.map((hr) =>
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
