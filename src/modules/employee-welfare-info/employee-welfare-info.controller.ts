import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeWelfareInfoService } from './employee-welfare-info.service';

@Controller('employees/:employeeUserId/welfare-informations')
export class EmployeeWelfareInfoController {
  constructor(private readonly employeeWelfareInfoService: EmployeeWelfareInfoService) {}

  @Get()
  async get(@Param('employeeUserId', ParseIntPipe) employeeUserId: number, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findById(employeeUserId);
    if (!target) throw new NotFoundException('Employee not found');
    const record = await this.employeeWelfareInfoService.get(employee.employeeId, employee.role, target.employeeId ?? undefined);
    return { success: true, message: 'Welfare info fetched', data: record };
  }
}
