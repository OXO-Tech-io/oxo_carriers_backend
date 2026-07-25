import { Controller, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { EmployeePiiModel } from './EmployeePii';
import { EmployeeModel } from '../../employees/Employee';
import { UserRole, JwtPayload } from '../../types';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';

const SELF_ONLY_ROLES: UserRole[] = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];

/**
 * Response shape ({ success, pii }, not the { success, data } envelope used
 * elsewhere) matches what the frontend's profileService.getEmployeePii has
 * always expected from this endpoint.
 */
@Controller('employees/:userId/pii')
export class EmployeePiiController {
  @Get()
  async getByUserId(@Param('userId', ParseIntPipe) userId: number, @CurrentEmployee() employee: JwtPayload) {
    if (SELF_ONLY_ROLES.includes(employee.role) && employee.userId !== userId) {
      throw new ForbiddenException();
    }
    const target = await EmployeeModel.findById(userId);
    if (!target) throw new NotFoundException('Employee not found');
    const pii = target.employeeId ? await EmployeePiiModel.findByEmployeeId(target.employeeId) : null;
    return { success: true, pii };
  }
}
