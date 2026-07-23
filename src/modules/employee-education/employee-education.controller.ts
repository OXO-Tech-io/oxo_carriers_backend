import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../models/Employee';
import { EmployeeEducationService } from './employee-education.service';

@Controller('api/employees/:employeeId/educations')
export class EmployeeEducationController {
  constructor(private readonly employeeEducationService: EmployeeEducationService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeEducationService.list(employee.userId, employee.role, target.id);
    return { success: true, message: 'Education records fetched', data: records };
  }
}
