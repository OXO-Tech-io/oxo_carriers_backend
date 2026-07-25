import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
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
import { FormsService } from './forms.service';
import { formResponseMulterOptions } from './forms.upload';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HR_ROLES: UserRole[] = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE];

@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get(':id')
  async getById(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const data = await this.formsService.getFormWithFields(id);
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
    const response = await this.formsService.submitResponse(id, employee.userId, body, files ?? []);
    return { success: true, message: 'Response submitted', data: response };
  }

  /**
   * GET /forms?mine=true - forms assigned to the caller (any authenticated
   * employee, matches the original formRoutes.ts routes registered before
   * `router.use(requireHR)`).
   * GET /forms - all forms. "Only HR Team should be able to view form
   * responses" per the requirements doc - requireHR covers both
   * hr_executive and hr_manager, with no further manager-only restriction
   * (matches the original formRoutes.ts comment).
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
    const result = await this.formsService.create(body, employee.userId);
    return { success: true, message: 'Form created', data: result };
  }

  @Post(':id/publishes')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async publish(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const form = await this.formsService.publish(id);
    return { success: true, message: 'Form published', data: form };
  }

  @Post(':id/distributes')
  @UseGuards(RolesGuard)
  @Roles(...HR_ROLES)
  async distribute(@Param('id') idParam: string, @Body() body: unknown) {
    const id = this.parseId(idParam);
    const result = await this.formsService.distribute(id, body);
    return { success: true, message: 'Form distributed', data: result };
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
  async exportResponses(@Param('id') idParam: string, @Res() res: Response) {
    const id = this.parseId(idParam);
    const buffer = await this.formsService.exportResponsesToExcel(id);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename=form-${id}-responses.xlsx`);
    res.send(buffer);
  }

  private parseId(idParam: string): number {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid form id');
    return id;
  }
}
