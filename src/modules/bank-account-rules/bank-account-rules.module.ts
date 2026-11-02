import { Module } from '@nestjs/common';
import { BankAccountRulesController } from './bank-account-rules.controller';
import { BankAccountRulesService } from './bank-account-rules.service';

@Module({
  controllers: [BankAccountRulesController],
  providers: [BankAccountRulesService],
})
export class BankAccountRulesModule {}
