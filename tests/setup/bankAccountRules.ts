import { setBankAccountRulesConfig } from "../../src/utils/bankAccountRules";
import { BANK_ACCOUNT_RULES_SEED } from "../../src/scripts/data/bankAccountRulesSeed";

// The validators read rules loaded from the database at startup
// (BankAccountRulesService) - unit tests have no database, so load the seed
// values as a fixture before every test file.
setBankAccountRulesConfig(BANK_ACCOUNT_RULES_SEED);
