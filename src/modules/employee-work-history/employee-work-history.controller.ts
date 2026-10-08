import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeWorkHistoryService } from './employee-work-history.service';

@Controller('employees/:employeeUserId/work-histories')
export class EmployeeWorkHistoryController {
  constructor(private readonly employeeWorkHistoryService: EmployeeWorkHistoryService) {}

  @Get()
  async list(@Param('employeeUserId', ParseIntPipe) employeeUserId: number, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findById(employeeUserId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeWorkHistoryService.list(employee.employeeId, employee.role, target.employeeId ?? undefined);
    return { success: true, message: 'Work history records fetched', data: records };
  }

  @Get('experience-summaries')
  async getExperienceSummary(@Param('employeeUserId', ParseIntPipe) employeeUserId: number, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findById(employeeUserId);
    if (!target) throw new NotFoundException('Employee not found');
    const summary = await this.employeeWorkHistoryService.getExperienceSummary(
      employee.employeeId,
      employee.role,
      target.employeeId ?? undefined,
    );
    return { success: true, message: 'Experience summary calculated', data: summary };
  }
}
