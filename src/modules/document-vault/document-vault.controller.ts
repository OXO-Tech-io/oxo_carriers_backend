import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { PERMISSIONS } from '../../common/constants/permissions';
import { DocumentVaultService } from './document-vault.service';
import { ATTACHMENTS_FIELD, ATTACHMENTS_MAX_COUNT, documentVaultUploadMulterOptions } from './document-vault.upload';

@Controller('documents')
export class DocumentVaultController {
  constructor(private readonly documentVaultService: DocumentVaultService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.DOCUMENT_VAULT, 'write')
  @UseInterceptors(FilesInterceptor(ATTACHMENTS_FIELD, ATTACHMENTS_MAX_COUNT, documentVaultUploadMulterOptions))
  async create(
    @CurrentEmployee() employee: JwtPayload,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const document = await this.documentVaultService.create(employee.userId, body, files ?? []);
    return { success: true, message: 'Document uploaded', data: document };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.DOCUMENT_VAULT, 'write')
  async delete(@Param('id') idParam: string) {
    const id = this.parseId(idParam, 'document id');
    await this.documentVaultService.delete(id);
    return { success: true, message: 'Document deleted' };
  }

  private parseId(idParam: string, label: string): number {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException(`Invalid ${label}`);
    return id;
  }
}
