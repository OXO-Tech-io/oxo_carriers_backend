import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { ArchiveService } from './archive.service';

// OCD-453: read-only Archive of deleted employee profiles - gated on the
// `archive` permission key (super_admin bypasses PermissionGuard entirely;
// HR Manager holds it by default - see the "Role Defaults" admin screen /
// tbl_role_permissions).
@Controller('archive')
@UseGuards(PermissionGuard)
@RequirePermission(PERMISSIONS.ARCHIVE, 'read')
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get()
  async list() {
    const archived = await this.archiveService.listAll();
    return { success: true, message: 'Archived employees fetched', data: archived };
  }

  @Get(':id')
  async getById(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid archive id');
    const archived = await this.archiveService.getById(id);
    return { success: true, message: 'Archived employee fetched', data: archived };
  }
}
