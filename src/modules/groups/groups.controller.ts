import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { PERMISSIONS } from '../../common/constants/permissions';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { RenameGroupDto } from './dto/rename-group.dto';
import { AddGroupMembersDto } from './dto/add-group-members.dto';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  // Any authenticated user can list groups (read-only, id/name/memberCount) -
  // needed so the Communications/Forms recipient pickers can offer groups as
  // a target without every sender needing the `groups` permission themselves.
  @Get()
  async list() {
    const groups = await this.groupsService.list();
    return { success: true, message: 'Groups fetched', data: groups };
  }

  // Full member roster (names/emails) is only exposed to holders of the
  // `groups` permission - the recipient pickers never need to call this.
  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.GROUPS, 'read')
  async getById(@Param('id', ParseIntPipe) id: number) {
    const data = await this.groupsService.getById(id);
    return { success: true, message: 'Group fetched', data };
  }

  @Post()
  @HttpCode(201)
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.GROUPS, 'write')
  async create(@Body() dto: CreateGroupDto, @CurrentEmployee() employee: JwtPayload) {
    const group = await this.groupsService.create(dto, employee.userId);
    return { success: true, message: 'Group created', data: group };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.GROUPS, 'write')
  async rename(@Param('id', ParseIntPipe) id: number, @Body() dto: RenameGroupDto) {
    const group = await this.groupsService.rename(id, dto);
    return { success: true, message: 'Group renamed', data: group };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.GROUPS, 'write')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.groupsService.remove(id);
    return { success: true, message: 'Group deleted', data: {} };
  }

  @Post(':id/members')
  @HttpCode(201)
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.GROUPS, 'write')
  async addMembers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddGroupMembersDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const members = await this.groupsService.addMembers(id, dto, employee.userId);
    return { success: true, message: 'Members added', data: members };
  }

  @Delete(':id/members/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.GROUPS, 'write')
  async removeMember(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    await this.groupsService.removeMember(id, userId);
    return { success: true, message: 'Member removed', data: {} };
  }
}
