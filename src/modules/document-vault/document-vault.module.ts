import { Module } from '@nestjs/common';
import { DocumentVaultController } from './document-vault.controller';
import { DocumentManageController } from './document-manage.controller';
import { EmployeeDocumentsController } from './employee-documents.controller';
import { DocumentVaultService } from './document-vault.service';

@Module({
  controllers: [DocumentVaultController, DocumentManageController, EmployeeDocumentsController],
  providers: [DocumentVaultService],
})
export class DocumentVaultModule {}
