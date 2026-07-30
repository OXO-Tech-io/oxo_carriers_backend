import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeNomineesService } from './employee-nominees.service';

@Controller('employees/:employeeUserId/nominees')
export class EmployeeNomineesController {
  constructor(private readonly employeeNomineesService: EmployeeNomineesService) {}

  @Get()
  async list(@Param('employeeUserId', ParseIntPipe) employeeUserId: number, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findById(employeeUserId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeNomineesService.list(employee.employeeId, employee.role, target.employeeId ?? undefined);
    return { success: true, message: 'Nominee records fetched', data: records };
  }
}
