import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { DocumentVaultService } from './document-vault.service';

@Controller('documents')
export class DocumentManageController {
  constructor(private readonly documentVaultService: DocumentVaultService) {}

  @Get('manage')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.DOCUMENT_VAULT, 'write')
  async listAll() {
    const data = await this.documentVaultService.listAll();
    return { success: true, message: 'Documents fetched', data };
  }
}
