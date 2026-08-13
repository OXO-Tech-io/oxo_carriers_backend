import { Module } from '@nestjs/common';
import { DocumentVaultController } from './document-vault.controller';
import { DocumentVaultService } from './document-vault.service';

@Module({
  controllers: [DocumentVaultController],
  providers: [DocumentVaultService],
})
export class DocumentVaultModule {}
