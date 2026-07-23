import { BadRequestException, Injectable } from '@nestjs/common';
import { workLogService } from '../../services/workLog.service';
import { SubmitWorkLogsDto } from './dto/submit-work-logs.dto';
import { ListWorkLogsQueryDto } from './dto/list-work-logs-query.dto';

@Injectable()
export class WorkLogsService {
  submitEntries(employeeId: string, dto: SubmitWorkLogsDto) {
    return workLogService.submitEntries(employeeId, dto.entries);
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
