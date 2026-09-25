import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { UserRole, JwtPayload } from '../../types';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { PROFILE_PICTURE_FIELD, profilePictureMulterOptions } from './profile-picture.upload';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users - returns the actual Keycloak-provisioned accounts
   * (cross-referenced against the local employee table by email).
   */
  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS, 'read')
  async getAll(@Query('search') search?: string) {
    const users = await this.usersService.getAll(search);
    return { success: true, users };
  }

  @Get('departments')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS, 'read')
  async getDepartments() {
    const departments = await this.usersService.getDepartments();
    return { success: true, departments };
  }

  // OCD-436: used by the Create Employee form to flag a duplicate email
  // inline on Step 1, before the user has filled in the rest of the wizard.
  // Must stay ahead of the ':employeeUserId' route below so
  // "email-availability" isn't swallowed by that dynamic segment.
  @Get('email-availability')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS, 'write')
  async checkEmail(@Query('email') email: string) {
    const result = await this.usersService.checkEmailAvailability(email);
    return { success: true, ...result };
  }

  // OCD-444: same "flag it as soon as the user leaves the field" pattern as
  // email-availability above, for the NIC Number (StepStatutory.tsx) and Bank
  // A/C Number (StepRemittance.tsx) fields shared by the Create Employee and
  // self-service Profile wizards. Left open to any authenticated employee
  // (rather than gated to HR/Finance like email-availability) since the
  // profile wizard is used by every role while editing their own NIC/bank
  // details; `excludeEmployeeId` is what lets that self-edit path check
  // against everyone else without flagging the employee's own current value.
  @Get('nic-availability')
  async checkNic(@Query('nationalId') nationalId: string, @Query('excludeEmployeeId') excludeEmployeeId?: string) {
    const result = await this.usersService.checkNicAvailability(nationalId, excludeEmployeeId);
    return { success: true, ...result };
  }

  @Get('bank-account-availability')
  async checkBankAccount(
    @Query('accountNumber') accountNumber: string,
    @Query('excludeEmployeeId') excludeEmployeeId?: string
  ) {
    const result = await this.usersService.checkBankAccountAvailability(accountNumber, excludeEmployeeId);
    return { success: true, ...result };
  }

  // OCD-454: "My Profile" camera-icon upload, keyed by :userId so it matches
  // the rest of this controller's resource-style routes. Not self-only at
  // the routing level - usersService.updateProfilePicture enforces that
  // SELF_ONLY_ROLES can only target their own userId (from the JWT), same as
  // getById/update above.
  @Post(':userId/profile-pictures')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor(PROFILE_PICTURE_FIELD, profilePictureMulterOptions))
  async uploadProfilePicture(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentEmployee() employee: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('No image file was provided');
    const user = await this.usersService.updateProfilePicture(userId, file, employee);
    return { success: true, message: 'Profile picture updated', user };
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
      ? `User created successfully, but Keycloak provisioning failed${keycloak.error ? `: ${keycloak.error}` : ''} - use POST /users/:id/keycloak-accounts to retry.`
      : keycloak.onboardingEmailSent
        ? 'User created and provisioned in Keycloak successfully. An onboarding email has been sent.'
        : `User created and provisioned in Keycloak successfully, but the onboarding email could not be sent${keycloak.error ? `: ${keycloak.error}` : ''}.`;
    return { success: true, message, user, keycloak };
  }

  @Post(':id/keycloak-accounts')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS, 'write')
  async provisionKeycloak(@Param('id', ParseIntPipe) id: number) {
    const result = await this.usersService.provisionKeycloak(id);
    if (result.alreadyProvisioned) {
      return { success: true, message: 'User is already provisioned in Keycloak.', keycloakSub: result.keycloakSub };
    }
    return {
      success: true,
      message: result.onboardingEmailSent
        ? 'User provisioned in Keycloak successfully. An onboarding email has been sent.'
        : `User provisioned in Keycloak successfully, but the onboarding email could not be sent${result.emailErrorReason ? `: ${result.emailErrorReason}` : ''}.`,
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

  // OCD-490: Account Status changes are restricted to Administrator
  // (super_admin) only.
  @Patch(':id/statuses')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const result = await this.usersService.updateStatus(id, dto.status, employee);
    return { success: true, message: `Status updated from '${result.previous_status}' to '${result.new_status}'`, user: result };
  }

  @Post(':id/password-resets')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS, 'write')
  async resetPassword(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() employee: JwtPayload) {
    const result = await this.usersService.resetPassword(id, employee);
    const message = result.emailSent
      ? 'Password has been reset. An email with the new temporary password has been sent to the user.'
      : `Password has been reset, but the notification email could not be sent${result.emailErrorReason ? `: ${result.emailErrorReason}` : ''}.`;
    return { success: true, message };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async delete(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() employee: JwtPayload) {
    await this.usersService.delete(id, employee);
    return { success: true, message: 'User deleted successfully' };
  }
}
