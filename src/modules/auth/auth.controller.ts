import { Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { SkipSessionCheck } from '../../common/decorators/skip-session-check.decorator';
import { EmployeesService } from '../../employees/employees.service';
import { JwtPayload } from '../../types';

/**
 * Identity is owned by Keycloak. Email verification and password
 * setup/reset are handled entirely by Keycloak's own hosted flows (see
 * keycloakAdminService.sendRequiredActionsEmail).
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

  /**
   * OCD-455: called once by the frontend right after an explicit, interactive
   * Keycloak login (never after a silent token refresh or SSO restore - see
   * lib/keycloak.ts's kcLogin/providers.tsx wiring). Unconditionally records
   * this token's `sid` as the account's sole active session, superseding
   * whatever was there before. This is the only place that promotes a
   * session - JwtAuthGuard's OCD-455 check only ever rejects a mismatch, so a
   * displaced session can never reclaim activeSessionId just by making
   * another request.
   */
  @Post('claim-sessions')
  @SkipSessionCheck()
  async claimSession(@CurrentEmployee() employee: JwtPayload) {
    if (employee.sid) {
      await this.employeesService.setActiveSessionId(employee.userId, employee.sid);
    }
    return { success: true, message: 'Session claimed' };
  }
}
