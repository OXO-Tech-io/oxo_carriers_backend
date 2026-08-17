import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { DocumentVaultService } from './document-vault.service';
import { GetDocumentsQueryDto } from './dto/get-documents-query.dto';

const DEFAULT_PAGE_SIZE = 10;

@Controller('documents')
export class DocumentManageController {
  constructor(private readonly documentVaultService: DocumentVaultService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.DOCUMENT_VAULT, 'write')
  async listAll(@Query() query: GetDocumentsQueryDto) {
    const data = await this.documentVaultService.listAll(query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
    return { success: true, message: 'Documents fetched', data };
  }
}
