import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { EmployeesService } from '../../employees/employees.service';
import { JwtPayload } from '../../types';

/**
 * Identity is owned by Keycloak. The only endpoint exposed here is /me,
 * which returns the DB profile linked to the verified Keycloak token. Email
 * verification and password setup/reset are handled entirely by Keycloak's
 * own hosted flows (see keycloakAdminService.sendRequiredActionsEmail).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('me')
  async getMe(@CurrentEmployee() employee: JwtPayload) {
    const user = await this.employeesService.findById(employee.userId);
    if (!user) throw new NotFoundException('User not found');
    return { success: true, message: 'Current user', data: user };
  }
}
