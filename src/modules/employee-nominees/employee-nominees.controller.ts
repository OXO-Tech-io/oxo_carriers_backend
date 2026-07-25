import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeNomineesService } from './employee-nominees.service';

@Controller('employees/:employeeId/nominees')
export class EmployeeNomineesController {
  constructor(private readonly employeeNomineesService: EmployeeNomineesService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeNomineesService.list(employee.employeeId, employee.role, employeeId);
    return { success: true, message: 'Nominee records fetched', data: records };
  }
}
