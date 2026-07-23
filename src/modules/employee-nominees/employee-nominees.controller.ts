import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../models/Employee';
import { EmployeeNomineesService } from './employee-nominees.service';

@Controller('api/employees/:employeeId/nominees')
export class EmployeeNomineesController {
  constructor(private readonly employeeNomineesService: EmployeeNomineesService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeNomineesService.list(employee.userId, employee.role, target.id);
    return { success: true, message: 'Nominee records fetched', data: records };
  }
}
