import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeEducationService } from './employee-education.service';

@Controller('employees/:employeeUserId/educations')
export class EmployeeEducationController {
  constructor(private readonly employeeEducationService: EmployeeEducationService) {}

  @Get()
  async list(@Param('employeeUserId', ParseIntPipe) employeeUserId: number, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findById(employeeUserId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeEducationService.list(employee.employeeId, employee.role, target.employeeId ?? undefined);
    return { success: true, message: 'Education records fetched', data: records };
  }
}
