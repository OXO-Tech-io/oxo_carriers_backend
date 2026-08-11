import { BadRequestException, Injectable } from '@nestjs/common';
import { workLogService } from './workLog.service';
import { SubmitWorkLogsDto } from './dto/submit-work-logs.dto';
import { ListWorkLogsQueryDto } from './dto/list-work-logs-query.dto';
import { UpdateWorkLogDeadlineDto } from './dto/update-work-log-deadline.dto';
import { GetWorkLogDailyStatusQueryDto } from './dto/get-work-log-daily-status-query.dto';
import { isValidTimezone } from './work-log-deadline.service';

@Injectable()
export class WorkLogsService {
  submitEntries(employeeId: string, dto: SubmitWorkLogsDto) {
    return workLogService.submitEntries(employeeId, dto.entries);
  }

  getDeadline(workDate?: string) {
    return workLogService.getDeadline(workDate);
  }

  async updateDeadline(updatedBy: number | null, dto: UpdateWorkLogDeadlineDto) {
    if (dto.timezone !== undefined && !isValidTimezone(dto.timezone)) {
      throw new BadRequestException(`Unknown timezone: ${dto.timezone}`);
    }
    await workLogService.updateDeadline(updatedBy, dto);
    // Same shape as GET /work-logs/deadline so the client can swap it straight
    // into the query cache.
    return workLogService.getDeadline();
  }

  listMine(employeeId: string, query: ListWorkLogsQueryDto) {
    return workLogService.listMine(employeeId, { from: query.from, to: query.to });
  }

  listAll(query: ListWorkLogsQueryDto) {
    return workLogService.listAll({ userId: query.userId, from: query.from, to: query.to });
  }

  getSummary(query: ListWorkLogsQueryDto) {
    return workLogService.getSummary({ from: query.from, to: query.to });
  }

  getDailyStatus(query: GetWorkLogDailyStatusQueryDto) {
    return workLogService.getDailyStatus(query.date);
  }

  generateSummaryReport(query: ListWorkLogsQueryDto) {
    return workLogService.generateSummaryReport({ from: query.from, to: query.to });
  }

  generateDetailedReport(query: ListWorkLogsQueryDto) {
    return workLogService.generateDetailedReport({ userId: query.userId, from: query.from, to: query.to });
  }

  generateTemplate() {
    return workLogService.generateTemplate();
  }

  async bulkUpload(employeeId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Excel file is required');
    return workLogService.bulkUpload(employeeId, file.path);
  }
}
