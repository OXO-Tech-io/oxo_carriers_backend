import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../models/Employee';
import { EmployeeWelfareInfoService } from './employee-welfare-info.service';

@Controller('api/employees/:employeeId/welfare-info')
export class EmployeeWelfareInfoController {
  constructor(private readonly employeeWelfareInfoService: EmployeeWelfareInfoService) {}

  @Get()
  async get(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const record = await this.employeeWelfareInfoService.get(employee.userId, employee.role, target.id);
    return { success: true, message: 'Welfare info fetched', data: record };
  }
}
