import { Controller, Get } from '@nestjs/common';
import { BankAccountRulesService } from './bank-account-rules.service';

@Controller('bank-account-rules')
export class BankAccountRulesController {
  constructor(private readonly bankAccountRulesService: BankAccountRulesService) {}

  /**
   * Readable by every authenticated employee - the bank dropdown and the
   * client-side account number checks on the profile/employee forms are built
   * from this, so they always match what the backend validates against.
   */
  @Get()
  getRules() {
    return { success: true, message: 'Bank account rules fetched', data: this.bankAccountRulesService.getConfig() };
  }
}
