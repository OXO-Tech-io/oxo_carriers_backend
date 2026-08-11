import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeEmergencyContactsService } from './employee-emergency-contacts.service';

@Controller('employees/:employeeUserId/emergency-contacts')
export class EmployeeEmergencyContactsController {
  constructor(private readonly employeeEmergencyContactsService: EmployeeEmergencyContactsService) {}

  @Get()
  async list(@Param('employeeUserId', ParseIntPipe) employeeUserId: number, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findById(employeeUserId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeEmergencyContactsService.list(employee.employeeId, employee.role, target.employeeId ?? undefined);
    return { success: true, message: 'Emergency contact records fetched', data: records };
  }
}
