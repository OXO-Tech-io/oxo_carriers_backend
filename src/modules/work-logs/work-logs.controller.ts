import { Body, Controller, Get, HttpCode, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { hasPermission } from '../../middleware/permissions';
import { JwtPayload, UserRole } from '../../types';
import { WorkLogsService } from './work-logs.service';
import { SubmitWorkLogsDto } from './dto/submit-work-logs.dto';
import { ListWorkLogsQueryDto } from './dto/list-work-logs-query.dto';
import { UpdateWorkLogDeadlineDto } from './dto/update-work-log-deadline.dto';
import { GetWorkLogDeadlineQueryDto } from './dto/get-work-log-deadline-query.dto';
import { GetWorkLogDailyStatusQueryDto } from './dto/get-work-log-daily-status-query.dto';
import { workLogsExcelMulterOptions } from './work-logs.upload';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('work-logs')
export class WorkLogsController {
  constructor(private readonly workLogsService: WorkLogsService) {}

  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.workLogsService.generateTemplate();
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename=work-log-template.xlsx');
    res.send(buffer);
  }

  /**
   * Readable by every authenticated employee - the Work Log page shows the
   * cut-off so people know when a submission starts counting as late.
   * `canEdit` mirrors what PUT below will allow, so the settings card only
   * renders for callers who can actually save it.
   */
  @Get('deadline')
  async getDeadline(@Query() query: GetWorkLogDeadlineQueryDto, @CurrentEmployee() employee: JwtPayload) {
    const deadline = await this.workLogsService.getDeadline(query.workDate);
    const canEdit =
      employee.role === UserRole.SUPER_ADMIN ||
      (!!employee.employeeId && (await hasPermission(employee.employeeId, PERMISSIONS.WORK_LOGS, 'write')));
    return { success: true, message: 'Work log deadline fetched', data: { ...deadline, canEdit } };
  }

  @Put('deadline')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.WORK_LOGS, 'write')
  async updateDeadline(@Body() dto: UpdateWorkLogDeadlineDto, @CurrentEmployee() employee: JwtPayload) {
    const deadline = await this.workLogsService.updateDeadline(employee.userId ?? null, dto);
    // The guard already established the caller may edit.
    return { success: true, message: 'Work log deadline updated', data: { ...deadline, canEdit: true } };
  }

  @Get('mine')
  async listMine(@Query() query: ListWorkLogsQueryDto, @CurrentEmployee() employee: JwtPayload) {
    const logs = await this.workLogsService.listMine(employee.employeeId!, query);
    return { success: true, message: 'Work logs fetched', data: logs };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async listAll(@Query() query: ListWorkLogsQueryDto) {
    const logs = await this.workLogsService.listAll(query);
    return { success: true, message: 'Work logs fetched', data: logs };
  }

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async getSummary(@Query() query: ListWorkLogsQueryDto) {
    const summary = await this.workLogsService.getSummary(query);
    return { success: true, message: 'Work log summary fetched', data: summary };
  }

  /** Attendance-style snapshot for the All Work Logs admin page: how many of the
   *  employees expected to log work today have done so, and on time. */
  @Get('daily-status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async getDailyStatus(@Query() query: GetWorkLogDailyStatusQueryDto) {
    const status = await this.workLogsService.getDailyStatus(query);
    return { success: true, message: 'Work log daily status fetched', data: status };
  }

  @Get('reports/summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async downloadSummaryReport(@Query() query: ListWorkLogsQueryDto, @Res() res: Response) {
    const buffer = await this.workLogsService.generateSummaryReport(query);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename=work-logs-summary.xlsx');
    res.send(buffer);
  }

  @Get('reports/detailed')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async downloadDetailedReport(@Query() query: ListWorkLogsQueryDto, @Res() res: Response) {
    const buffer = await this.workLogsService.generateDetailedReport(query);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename=work-logs-detailed.xlsx');
    res.send(buffer);
  }

  @Post()
  @HttpCode(201)
  async submit(@Body() dto: SubmitWorkLogsDto, @CurrentEmployee() employee: JwtPayload) {
    const result = await this.workLogsService.submitEntries(employee.employeeId!, dto);
    return { success: true, message: 'Work log entries submitted', data: result };
  }

  @Post('bulk-uploads')
  @UseInterceptors(FileInterceptor('excel', workLogsExcelMulterOptions))
  async bulkUpload(@UploadedFile() file: Express.Multer.File, @CurrentEmployee() employee: JwtPayload) {
    const result = await this.workLogsService.bulkUpload(employee.employeeId!, file);
    return { success: true, message: 'Bulk upload processed', data: result };
  }
}
