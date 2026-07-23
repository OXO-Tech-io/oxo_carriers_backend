import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EmployeeModel } from '../../models/Employee';
import { EmployeeEmergencyContactsService } from './employee-emergency-contacts.service';

@Controller('api/employees/:employeeId/emergency-contacts')
export class EmployeeEmergencyContactsController {
  constructor(private readonly employeeEmergencyContactsService: EmployeeEmergencyContactsService) {}

  @Get()
  async list(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const target = await EmployeeModel.findByEmployeeId(employeeId);
    if (!target) throw new NotFoundException('Employee not found');
    const records = await this.employeeEmergencyContactsService.list(employee.userId, employee.role, target.id);
    return { success: true, message: 'Emergency contact records fetched', data: records };
  }
}
