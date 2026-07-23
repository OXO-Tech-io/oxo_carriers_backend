import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, UserRole } from '../../types';
import { logger } from '../../lib/logger';
import { sendFormResponseNotificationEmail, sendFormSubmissionConfirmationEmail } from '../../config/email';
import { FormsService } from './forms.service';
import { formResponseMulterOptions } from './forms.upload';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HR_ROLES = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE] as const;

@Controller('api/forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  // Employee-facing: forms assigned to me + submission. Matches the original
  // formRoutes.ts, where these routes are registered before `router.use(requireHR)`
  // and are open to any authenticated employee. Keep 'mine' registered before ':id'
  // - Express/Nest match routes in declaration order, so ':id' would otherwise
  // swallow '/mine' as id='mine'.
  @Get('mine')
  async listAssignedToMe(@CurrentEmployee() employee: JwtPayload) {
    const result = await this.formsService.listAssignedToMe(employee.userId);
    return { success: true, message: 'Assigned forms fetched', data: result };
  }

  @Get(':id')
  async getById(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const data = await this.formsService.getFormGraph(id);
    return { success: true, message: 'Form fetched', data };
  }

  @Post(':id/responses')
  @UseInterceptors(AnyFilesInterceptor(formResponseMulterOptions))
  async submitResponse(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const id = this.parseId(idParam);
    const result = await this.formsService.submitResponse(id, employee.userId, body, files ?? []);

    // Notifications (non-blocking, matches leaves.controller.ts's pattern) - only on the first
    // final submission, not on drafts or edit-resubmits.
    if (result.isFirstSubmission) {
      this.notifySubmission(result).catch((emailErr: unknown) => {
        logger.error({ err: emailErr }, 'Failed to send form response email(s)');
      });
    }

    return { success: true, message: 'Response submitted', data: result.response };
  }

  // HR-facing: create/edit/build/distribute/view responses. "Only HR Team should be
  // able to view form responses" per the requirements doc - requireHR covers both
  // hr_executive and hr_manager, with no further manager-only restriction (matches
  // the original formRoutes.ts comment).
  @Get()
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async list() {
    const forms = await this.formsService.list();
    return { success: true, message: 'Forms fetched', data: forms };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async create(@CurrentEmployee() employee: JwtPayload, @Body() body: unknown) {
    const result = await this.formsService.create(body, employee.userId);
    return { success: true, message: 'Form created', data: result };
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async update(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.update(id, body);
    return { success: true, message: 'Form updated', data: result };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async remove(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.formsService.remove(id);
    return { success: true, message: 'Form deleted', data: null };
  }

  @Post(':id/duplicate')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async duplicate(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const result = await this.formsService.duplicate(id, employee.userId);
    return { success: true, message: 'Form duplicated', data: result };
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  @Post(':id/sections')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async createSection(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.createSection(id, body);
    return { success: true, message: 'Section created', data: result };
  }

  @Put('sections/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateSection(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.updateSection(id, body);
    return { success: true, message: 'Section updated', data: result };
  }

  @Delete('sections/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async deleteSection(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.formsService.deleteSection(id);
    return { success: true, message: 'Section deleted', data: null };
  }

  @Post(':id/sections/reorder')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async reorderSections(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    await this.formsService.reorderSections(id, body);
    return { success: true, message: 'Sections reordered', data: null };
  }

  // ── Questions ────────────────────────────────────────────────────────────

  @Post(':id/questions')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async createQuestion(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.createQuestion(id, body);
    return { success: true, message: 'Question created', data: result };
  }

  @Put('questions/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateQuestion(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.updateQuestion(id, body);
    return { success: true, message: 'Question updated', data: result };
  }

  @Delete('questions/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async deleteQuestion(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.formsService.deleteQuestion(id);
    return { success: true, message: 'Question deleted', data: null };
  }

  @Post(':id/questions/reorder')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async reorderQuestions(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    await this.formsService.reorderQuestions(id, body);
    return { success: true, message: 'Questions reordered', data: null };
  }

  // ── Logic rules ──────────────────────────────────────────────────────────

  @Post(':id/logic-rules')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async createLogicRule(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.createLogicRule(id, body);
    return { success: true, message: 'Logic rule created', data: result };
  }

  @Put('logic-rules/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateLogicRule(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.updateLogicRule(id, body);
    return { success: true, message: 'Logic rule updated', data: result };
  }

  @Delete('logic-rules/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async deleteLogicRule(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.formsService.deleteLogicRule(id);
    return { success: true, message: 'Logic rule deleted', data: null };
  }

  // ── Settings & theme ─────────────────────────────────────────────────────

  @Get(':id/settings')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async getSettings(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const result = await this.formsService.getSettings(id);
    return { success: true, message: 'Form settings fetched', data: result };
  }

  @Put(':id/settings')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateSettings(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.updateSettings(id, body);
    return { success: true, message: 'Form settings updated', data: result };
  }

  @Get(':id/theme')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async getTheme(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const result = await this.formsService.getTheme(id);
    return { success: true, message: 'Form theme fetched', data: result };
  }

  @Put(':id/theme')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateTheme(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.updateTheme(id, body);
    return { success: true, message: 'Form theme updated', data: result };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  @Post(':id/publish')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async publish(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const form = await this.formsService.publish(id);
    return { success: true, message: 'Form published', data: form };
  }

  @Post(':id/unpublish')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async unpublish(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const form = await this.formsService.unpublish(id);
    return { success: true, message: 'Form unpublished', data: form };
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async archive(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const form = await this.formsService.archive(id);
    return { success: true, message: 'Form archived', data: form };
  }

  @Post(':id/distribute')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async distribute(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.distribute(id, body);
    return { success: true, message: 'Form distributed', data: result };
  }

  // ── Responses & analytics ────────────────────────────────────────────────

  @Get(':id/responses')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async listResponses(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const responses = await this.formsService.listResponses(id);
    return { success: true, message: 'Responses fetched', data: responses };
  }

  @Get(':id/responses/export')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async exportResponses(@Param('id') idParam: string, @Query() query: unknown, @Res() res: Response) {
    const id = this.parseId(idParam);
    const format = this.formsService.parseExportFormat(query);
    if (format === 'csv') {
      const csv = await this.formsService.exportResponsesToCsv(id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=form-${id}-responses.csv`);
      res.send(csv);
      return;
    }
    const buffer = await this.formsService.exportResponsesToExcel(id);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename=form-${id}-responses.xlsx`);
    res.send(buffer);
  }

  @Get(':id/analytics')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async getAnalytics(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const result = await this.formsService.getAnalytics(id);
    return { success: true, message: 'Form analytics fetched', data: result };
  }

  private parseId(idParam: string): number {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid form id');
    return id;
  }

  private async notifySubmission(result: Awaited<ReturnType<FormsService['submitResponse']>>) {
    const { form, settings, respondent, owner } = result;
    const respondentName = respondent ? `${respondent.firstName} ${respondent.lastName}`.trim() : 'An employee';
    const submittedDate = new Date().toLocaleString('en-GB');

    if (settings?.notifyOwnerOnResponse && owner?.email) {
      await sendFormResponseNotificationEmail(owner.email, {
        ownerName: `${owner.firstName} ${owner.lastName}`.trim() || 'there',
        formTitle: form.title,
        respondentName,
        submittedDate,
      });
    }

    if (settings?.notifyRespondent && respondent?.email) {
      await sendFormSubmissionConfirmationEmail(respondent.email, {
        respondentName,
        formTitle: form.title,
        submittedDate,
      });
    }
  }
}
