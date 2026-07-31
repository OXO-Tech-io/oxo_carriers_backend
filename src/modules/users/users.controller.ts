import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { UserRole, JwtPayload } from '../../types';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users - returns the actual Keycloak-provisioned accounts
   * (cross-referenced against the local employee table by email).
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE, UserRole.FINANCE_MANAGER, UserRole.FINANCE_EXECUTIVE)
  async getAll(@Query('search') search?: string) {
    const users = await this.usersService.getAll(search);
    return { success: true, users };
  }

  @Get('departments')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE, UserRole.FINANCE_MANAGER, UserRole.FINANCE_EXECUTIVE)
  async getDepartments() {
    const departments = await this.usersService.getDepartments();
    return { success: true, departments };
  }

  @Get(':employeeUserId')
  async getById(@Param('employeeUserId', ParseIntPipe) employeeUserId: number, @CurrentEmployee() employee: JwtPayload) {
    const { user, personalDetails } = await this.usersService.getById(employeeUserId, employee);
    return { success: true, user, personalDetails };
  }

  /** Only HR (and super_admin) can create employees; Finance can only create service providers via Create Service Provider. */
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateUserDto, @CurrentEmployee() employee: JwtPayload) {
    const { keycloak, ...user } = await this.usersService.create(dto, employee);
    const message = !keycloak.provisioned
      ? 'User created successfully. Keycloak provisioning was skipped or failed - use POST /users/:id/keycloak-accounts to provision manually.'
      : keycloak.onboardingEmailSent
        ? 'User created and provisioned in Keycloak successfully. An onboarding email has been sent.'
        : 'User created and provisioned in Keycloak successfully, but the onboarding email could not be sent.';
    return { success: true, message, user };
  }

  @Post(':id/keycloak-accounts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  async provisionKeycloak(@Param('id', ParseIntPipe) id: number) {
    const result = await this.usersService.provisionKeycloak(id);
    if (result.alreadyProvisioned) {
      return { success: true, message: 'User is already provisioned in Keycloak.', keycloakSub: result.keycloakSub };
    }
    return {
      success: true,
      message: result.onboardingEmailSent
        ? 'User provisioned in Keycloak successfully. An onboarding email has been sent.'
        : 'User provisioned in Keycloak successfully, but the onboarding email could not be sent.',
      keycloakSub: result.keycloakSub,
      onboardingEmailSent: result.onboardingEmailSent,
    };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentEmployee() employee: JwtPayload) {
    const user = await this.usersService.update(id, dto, employee);
    return { success: true, message: 'User updated successfully', user };
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRoleDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const result = await this.usersService.updateRole(id, dto.role, employee);
    return { success: true, message: `Role updated from '${result.previous_role}' to '${result.new_role}'`, user: result };
  }

  @Post(':id/password-resets')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  async resetPassword(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() employee: JwtPayload) {
    await this.usersService.resetPassword(id, employee);
    return { success: true, message: 'Password reset email has been sent to the user' };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async delete(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() employee: JwtPayload) {
    await this.usersService.delete(id, employee);
    return { success: true, message: 'User deleted successfully' };
  }
}
