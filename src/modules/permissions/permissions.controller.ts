import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { PERMISSIONS } from '../../common/constants/permissions';
import { PermissionsService } from './permissions.service';
import { ReplaceUserPermissionsDto } from './dto/replace-user-permissions.dto';

const parseUserId = (idParam: string): number => {
  const id = Number.parseInt(idParam, 10);
  if (Number.isNaN(id)) {
    throw new BadRequestException('Invalid user ID');
  }
  return id;
};

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('catalog')
  getPermissionCatalog() {
    return { success: true, permissions: this.permissionsService.getCatalog() };
  }

  @Get('me')
  async getMyPermissions(@CurrentEmployee() employee: JwtPayload) {
    const result = await this.permissionsService.getMyPermissions(employee.userId);
    return { success: true, ...result };
  }

  @Get('manageable-users')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PERMISSIONS, 'read')
  async getManageableUsers() {
    const users = await this.permissionsService.getManageableUsers();
    return { success: true, users };
  }

  @Get('users')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PERMISSIONS, 'read')
  async getAllUserPermissions() {
    const result = await this.permissionsService.getAllUserPermissions();
    return { success: true, ...result };
  }

  @Get('users/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PERMISSIONS, 'read')
  async getUserPermissions(@Param('id') idParam: string) {
    const userId = parseUserId(idParam);
    const result = await this.permissionsService.getUserPermissions(userId);
    return { success: true, ...result };
  }

  @Put('users/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PERMISSIONS, 'write')
  async replaceUserPermissions(
    @Param('id') idParam: string,
    @Body() dto: ReplaceUserPermissionsDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const userId = parseUserId(idParam);
    const result = await this.permissionsService.replaceUserPermissions(employee.userId, userId, dto.permissions);
    return { success: true, ...result };
  }
}
