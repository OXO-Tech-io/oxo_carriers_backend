import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../models/Employee';
import { EmployeeDependentsService } from './employee-dependents.service';

@Controller('api/employees/:employeeId/dependents')
export class EmployeeDependentsController {
  constructor(private readonly employeeDependentsService: EmployeeDependentsService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeDependentsService.list(employee.employeeId, employee.role, employeeId);
    return { success: true, message: 'Dependent records fetched', data: records };
  }
}
