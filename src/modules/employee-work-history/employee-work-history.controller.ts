import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../models/Employee';
import { EmployeeWorkHistoryService } from './employee-work-history.service';

@Controller('api/employees/:employeeId/work-histories')
export class EmployeeWorkHistoryController {
  constructor(private readonly employeeWorkHistoryService: EmployeeWorkHistoryService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeWorkHistoryService.list(employee.userId, employee.role, target.id);
    return { success: true, message: 'Work history records fetched', data: records };
  }

  @Get('experience-summary')
  async getExperienceSummary(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const summary = await this.employeeWorkHistoryService.getExperienceSummary(
      employee.userId,
      employee.role,
      target.id,
    );
    return { success: true, message: 'Experience summary calculated', data: summary };
  }
}
