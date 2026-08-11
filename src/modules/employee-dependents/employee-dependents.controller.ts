import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeDependentsService } from './employee-dependents.service';

@Controller('employees/:employeeUserId/dependents')
export class EmployeeDependentsController {
  constructor(private readonly employeeDependentsService: EmployeeDependentsService) {}

  @Get()
  async list(@Param('employeeUserId', ParseIntPipe) employeeUserId: number, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findById(employeeUserId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeDependentsService.list(employee.employeeId, employee.role, target.employeeId ?? undefined);
    return { success: true, message: 'Dependent records fetched', data: records };
  }
}
