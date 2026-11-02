import type { BankAccountRulesConfig } from '../../utils/bankAccountRules';

// Initial contents of tbl_bank_account_rules / tbl_bank_account_settings,
// inserted by src/scripts/addBankAccountRulesTables.ts and loaded as the
// fixture for unit tests (tests/setup/bankAccountRules.ts). The live values
// are whatever is in the tables - editing this file does not change them.
export const BANK_ACCOUNT_RULES_SEED: BankAccountRulesConfig = {
  fallbackAccountNumberMin: 6,
  fallbackAccountNumberMax: 20,
  rules: [
    { bank: 'Bank of Ceylon', aliases: ['bankofceylon', 'boc'], lengths: [10] },
    { bank: 'Commercial Bank of Ceylon', aliases: ['commercialbankofceylon', 'commercialbank', 'combank'], lengths: [10] },
    { bank: 'Citibank', aliases: ['citibank', 'citi'], lengths: [10] },
    { bank: 'Deutsche Bank', aliases: ['deutschebank'], lengths: [10] },
    {
      bank: 'Standard Chartered Bank',
      aliases: ['standardchartered', 'standardcharteredbank', 'scb'],
      lengths: [11, 12],
      prefixes: { '11': ['18', '01'], '12': ['88'] },
    },
    { bank: 'Cargills Bank', aliases: ['cargillsbank'], lengths: [12] },
    { bank: 'DFCC Bank', aliases: ['dfccbank', 'dfcc'], lengths: [12] },
    { bank: 'Hatton National Bank', aliases: ['hattonnationalbank', 'hnb'], lengths: [12] },
    { bank: 'HSBC', aliases: ['hsbc'], lengths: [12] },
    { bank: 'National Development Bank', aliases: ['nationaldevelopmentbank', 'ndbbank', 'ndb'], lengths: [12] },
    { bank: 'National Savings Bank', aliases: ['nationalsavingsbank', 'nsb'], lengths: [12] },
    { bank: 'Nations Trust Bank', aliases: ['nationstrustbank', 'ntb'], lengths: [12] },
    { bank: 'Pan Asia Bank', aliases: ['panasiabank', 'pabc'], lengths: [12] },
    { bank: 'Regional Development Bank', aliases: ['regionaldevelopmentbank', 'rdb'], lengths: [12] },
    { bank: 'Sampath Bank', aliases: ['sampathbank'], lengths: [12] },
    { bank: 'Amana Bank', aliases: ['amanabank'], lengths: [13] },
    { bank: 'Public Bank', aliases: ['publicbank'], lengths: [13] },
    { bank: 'Habib Bank', aliases: ['habibbank'], lengths: [13] },
    { bank: 'State Bank of India', aliases: ['statebankofindia', 'sbi'], lengths: [14] },
    { bank: "People's Bank", aliases: ['peoplesbank'], lengths: [15] },
    { bank: 'Seylan Bank', aliases: ['seylanbank'], lengths: [15] },
    { bank: 'Union Bank', aliases: ['unionbank'], lengths: [16] },
    { bank: 'CDB', aliases: ['citizensdevelopmentbusiness', 'cdbbank', 'cdb'], lengths: [18] },
  ],
};
