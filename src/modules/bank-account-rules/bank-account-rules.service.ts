import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pool from '../../config/database';
import {
  BankAccountRule,
  BankAccountRulesConfig,
  getBankAccountRulesConfig,
  setBankAccountRulesConfig,
} from '../../utils/bankAccountRules';

// Each instance re-reads the tables on this interval, so a row edited directly
// in tbl_bank_account_rules / tbl_bank_account_settings reaches every running
// instance without a restart.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Owns the in-memory copy of the bank account rules that the synchronous
 * validators in src/utils/bankAccountRules.ts read. The initial load runs
 * before the app starts serving requests and fails startup if it can't read
 * the tables (run `npm run db:add-bank-account-rules-tables` first) - silently
 * validating with no rules would accept account numbers the bank rejects.
 */
@Injectable()
export class BankAccountRulesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BankAccountRulesService.name);
  private refreshTimer: NodeJS.Timeout | null = null;

  async onModuleInit() {
    try {
      await this.reload();
    } catch (error: any) {
      if (error?.code === '42P01') {
        throw new Error(
          `Bank account rules tables are missing (${error.message}) - run \`npm run db:add-bank-account-rules-tables\` before starting the server`,
        );
      }
      throw error;
    }
    this.refreshTimer = setInterval(() => {
      this.reload().catch((error) => this.logger.error('Failed to refresh bank account rules - keeping the previous copy', error));
    }, REFRESH_INTERVAL_MS);
    this.refreshTimer.unref();
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async reload(): Promise<BankAccountRulesConfig> {
    const [rulesResult, settingsResult] = await Promise.all([
      pool.query(
        `SELECT bank_name, aliases, lengths, prefixes
           FROM tbl_bank_account_rules
          WHERE is_active
          ORDER BY display_order, bank_name`,
      ),
      pool.query(
        `SELECT fallback_account_number_min, fallback_account_number_max
           FROM tbl_bank_account_settings
          WHERE id = 1`,
      ),
    ]);

    const settings = settingsResult.rows[0];
    if (!settings) throw new Error('tbl_bank_account_settings has no settings row (id = 1)');

    const rules: BankAccountRule[] = rulesResult.rows.map((row: any) => ({
      bank: row.bank_name,
      aliases: row.aliases,
      lengths: row.lengths,
      prefixes: row.prefixes ?? null,
    }));

    setBankAccountRulesConfig({
      rules,
      fallbackAccountNumberMin: settings.fallback_account_number_min,
      fallbackAccountNumberMax: settings.fallback_account_number_max,
    });
    return getBankAccountRulesConfig();
  }

  getConfig(): BankAccountRulesConfig {
    return getBankAccountRulesConfig();
  }
}
