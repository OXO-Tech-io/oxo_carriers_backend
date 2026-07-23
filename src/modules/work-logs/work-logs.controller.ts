import { Body, Controller, Get, HttpCode, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, UserRole } from '../../types';
import { WorkLogsService } from './work-logs.service';
import { SubmitWorkLogsDto } from './dto/submit-work-logs.dto';
import { ListWorkLogsQueryDto } from './dto/list-work-logs-query.dto';
import { workLogsExcelMulterOptions } from './work-logs.upload';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('api/work-logs')
export class WorkLogsController {
  constructor(private readonly workLogsService: WorkLogsService) {}

  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.workLogsService.generateTemplate();
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename=work-log-template.xlsx');
    res.send(buffer);
  }

  @Get('mine')
  async listMine(@Query() query: ListWorkLogsQueryDto, @CurrentEmployee() employee: JwtPayload) {
    const logs = await this.workLogsService.listMine(employee.userId, query);
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
    const result = await this.workLogsService.submitEntries(employee.userId, dto);
    return { success: true, message: 'Work log entries submitted', data: result };
  }

  @Post('bulk-upload')
  @UseInterceptors(FileInterceptor('excel', workLogsExcelMulterOptions))
  async bulkUpload(@UploadedFile() file: Express.Multer.File, @CurrentEmployee() employee: JwtPayload) {
    const result = await this.workLogsService.bulkUpload(employee.userId, file);
    return { success: true, message: 'Bulk upload processed', data: result };
  }
}
