import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, UserRole } from '../../types';
import { FormsService } from './forms.service';
import { formResponseMulterOptions, formThemeMulterOptions } from './forms.upload';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HR_ROLES: UserRole[] = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE];

@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  /**
   * GET /forms?mine=true - forms assigned to the caller (any authenticated
   * employee).
   * GET /forms - all forms, HR-only.
   */
  @Get()
  async list(@CurrentEmployee() employee: JwtPayload, @Query('mine') mine?: string) {
    if (mine === 'true') {
      const result = await this.formsService.listAssignedToMe(employee.userId);
      return { success: true, message: 'Assigned forms fetched', data: result };
    }
    if (employee.role !== UserRole.SUPER_ADMIN && !HR_ROLES.includes(employee.role)) {
      throw new ForbiddenException('Forbidden: Insufficient permissions');
    }
    const forms = await this.formsService.list();
    return { success: true, message: 'Forms fetched', data: forms };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async create(@CurrentEmployee() employee: JwtPayload, @Body() body: unknown) {
    const form = await this.formsService.create(body, employee.userId);
    return { success: true, message: 'Form created', data: form };
  }

  @Get(':id')
  async getById(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const data = await this.formsService.getFormWithGraph(id);
    return { success: true, message: 'Form fetched', data };
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async update(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const form = await this.formsService.update(id, body);
    return { success: true, message: 'Form updated', data: form };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async delete(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.formsService.delete(id);
    return { success: true, message: 'Form deleted' };
  }

  @Post(':id/duplicate')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async duplicate(@Param('id') idParam: string, @CurrentEmployee() employee: JwtPayload) {
    const id = this.parseId(idParam);
    const form = await this.formsService.duplicate(id, employee.userId);
    return { success: true, message: 'Form duplicated', data: form };
  }

  @Post(':id/publishes')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async publish(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const form = await this.formsService.publish(id);
    return { success: true, message: 'Form published', data: form };
  }

  @Post(':id/unpublishes')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async unpublish(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const form = await this.formsService.unpublish(id);
    return { success: true, message: 'Form unpublished', data: form };
  }

  @Post(':id/archives')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async archive(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const form = await this.formsService.archive(id);
    return { success: true, message: 'Form archived', data: form };
  }

  @Post(':id/distributes')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async distribute(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.distribute(id, body);
    return { success: true, message: 'Form distributed', data: result };
  }

  @Get(':id/my-responses')
  async getMyResponse(@Param('id') idParam: string, @CurrentEmployee() employee: JwtPayload) {
    const id = this.parseId(idParam);
    const data = await this.formsService.getMyResponse(id, employee.userId);
    return { success: true, message: 'Response fetched', data };
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
    const response = await this.formsService.submitResponse(id, employee.userId, body, files ?? []);
    return { success: true, message: 'Response submitted', data: response };
  }

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
  async exportResponses(@Param('id') idParam: string, @Query('format') format: string | undefined, @Res() res: Response) {
    const id = this.parseId(idParam);
    const fmt = format === 'csv' ? 'csv' : 'xlsx';
    const buffer = await this.formsService.exportResponses(id, fmt);
    if (fmt === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=form-${id}-responses.csv`);
    } else {
      res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename=form-${id}-responses.xlsx`);
    }
    res.send(buffer);
  }

  @Post(':formId/sections')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async createSection(@Param('formId') formIdParam: string, @Body() body: unknown) {
    const formId = this.parseId(formIdParam);
    const section = await this.formsService.createSection(formId, body);
    return { success: true, message: 'Section created', data: section };
  }

  @Put('sections/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateSection(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const section = await this.formsService.updateSection(id, body);
    return { success: true, message: 'Section updated', data: section };
  }

  @Delete('sections/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async deleteSection(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.formsService.deleteSection(id);
    return { success: true, message: 'Section deleted' };
  }

  @Post(':formId/sections/reorder')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async reorderSections(@Param('formId') formIdParam: string, @Body() body: unknown) {
    this.parseId(formIdParam);
    await this.formsService.reorderSections(body);
    return { success: true, message: 'Sections reordered' };
  }

  @Post(':formId/questions')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async createQuestion(@Param('formId') formIdParam: string, @Body() body: unknown) {
    const formId = this.parseId(formIdParam);
    const question = await this.formsService.createQuestion(formId, body);
    return { success: true, message: 'Question created', data: question };
  }

  @Put('questions/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateQuestion(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const question = await this.formsService.updateQuestion(id, body);
    return { success: true, message: 'Question updated', data: question };
  }

  @Delete('questions/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async deleteQuestion(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.formsService.deleteQuestion(id);
    return { success: true, message: 'Question deleted' };
  }

  @Post(':formId/questions/reorder')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async reorderQuestions(@Param('formId') formIdParam: string, @Body() body: unknown) {
    this.parseId(formIdParam);
    await this.formsService.reorderQuestions(body);
    return { success: true, message: 'Questions reordered' };
  }

  @Post(':formId/logic-rules')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async createLogicRule(@Param('formId') formIdParam: string, @Body() body: unknown) {
    const formId = this.parseId(formIdParam);
    const rule = await this.formsService.createLogicRule(formId, body);
    return { success: true, message: 'Logic rule created', data: rule };
  }

  @Put('logic-rules/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateLogicRule(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const rule = await this.formsService.updateLogicRule(id, body);
    return { success: true, message: 'Logic rule updated', data: rule };
  }

  @Delete('logic-rules/:id')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async deleteLogicRule(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.formsService.deleteLogicRule(id);
    return { success: true, message: 'Logic rule deleted' };
  }

  @Get(':formId/settings')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async getSettings(@Param('formId') formIdParam: string) {
    const formId = this.parseId(formIdParam);
    const settings = await this.formsService.getSettings(formId);
    return { success: true, message: 'Settings fetched', data: settings };
  }

  @Put(':formId/settings')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async updateSettings(@Param('formId') formIdParam: string, @Body() body: unknown) {
    const formId = this.parseId(formIdParam);
    const settings = await this.formsService.updateSettings(formId, body);
    return { success: true, message: 'Settings updated', data: settings };
  }

  @Get(':formId/themes')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async getTheme(@Param('formId') formIdParam: string) {
    const formId = this.parseId(formIdParam);
    const theme = await this.formsService.getTheme(formId);
    return { success: true, message: 'Theme fetched', data: theme };
  }

  @Put(':formId/themes')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  @UseInterceptors(FileInterceptor('headerImage', formThemeMulterOptions))
  async updateTheme(
    @Param('formId') formIdParam: string,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const formId = this.parseId(formIdParam);
    const theme = await this.formsService.updateTheme(formId, body, file);
    return { success: true, message: 'Theme updated', data: theme };
  }

  @Get(':formId/analytics')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async getAnalytics(@Param('formId') formIdParam: string) {
    const formId = this.parseId(formIdParam);
    const analytics = await this.formsService.getAnalytics(formId);
    return { success: true, message: 'Analytics fetched', data: analytics };
  }

  private parseId(idParam: string): number {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid id');
    return id;
  }
}
