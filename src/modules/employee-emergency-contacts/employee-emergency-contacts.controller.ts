import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeEmergencyContactsService } from './employee-emergency-contacts.service';

@Controller('employees/:employeeId/emergency-contacts')
export class EmployeeEmergencyContactsController {
  constructor(private readonly employeeEmergencyContactsService: EmployeeEmergencyContactsService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeEmergencyContactsService.list(employee.employeeId, employee.role, employeeId);
    return { success: true, message: 'Emergency contact records fetched', data: records };
  }
}
