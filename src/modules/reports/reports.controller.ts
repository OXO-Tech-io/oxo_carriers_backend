import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../types';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(RolesGuard)
@Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('leaves')
  async leaveReport(
    @Res() res: Response,
    @Query('department') department?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
    @Query('format') format?: string,
  ) {
    const data = await this.reportsService.getLeaveReportData({ department, year, month, status });

    if (format === 'excel') {
      const workbook = this.reportsService.buildLeaveReportWorkbook(data);
      const yearMonth = [year, month].filter(Boolean).join('-');
      const filename = `leave-report${yearMonth ? '-' + yearMonth : ''}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    res.json({ success: true, data, count: data.length });
  }

  @Get('salaries')
  async salaryReport(
    @Res() res: Response,
    @Query('department') department?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('format') format?: string,
  ) {
    const data = await this.reportsService.getSalaryReportData({ department, year, month });

    if (format === 'excel') {
      const workbook = this.reportsService.buildSalaryReportWorkbook(data);
      const yearMonth = [year, month].filter(Boolean).join('-');
      const filename = `salary-report${yearMonth ? '-' + yearMonth : ''}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    res.json({ success: true, data, count: data.length });
  }

  @Get('dashboard')
  async dashboard() {
    const metrics = await this.reportsService.getDashboardMetrics();
    return { success: true, metrics };
  }

  @Get('submission-breakdowns')
  async submissionsBreakdown(
    @Res() res: Response,
    @Query('department') department?: string,
    @Query('employeeId') employeeId?: string,
    @Query('formId') formId?: string,
    @Query('communicationId') communicationId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('format') format?: string,
  ) {
    const data = await this.reportsService.getSubmissionsBreakdown({
      department,
      employeeId,
      formId: formId ? Number(formId) : undefined,
      communicationId: communicationId ? Number(communicationId) : undefined,
      status,
      startDate,
      endDate,
      search,
    });

    if (format === 'excel') {
      const workbook = this.reportsService.buildSubmissionsBreakdownWorkbook(data);
      const filename = `submissions-compliance-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    res.json({ success: true, ...data });
  }
}
