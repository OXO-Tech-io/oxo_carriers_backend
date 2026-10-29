import pool from '../config/database';
import { BANK_ACCOUNT_RULES_SEED } from './data/bankAccountRulesSeed';

// Idempotent, additive-only migration script - mirrors the addGroupsTables.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// Drizzle schema: src/common/schema/bankAccountRules.schema.ts.
//
// OCD-598: moves the per-bank account number rules and the generic fallback
// digit range out of src/utils/bankAccountRules.ts into tables so they can be
// updated without a code change. Seeds the values from
// ./data/bankAccountRulesSeed.ts; existing rows are never overwritten, so
// values edited in the table survive a re-run.
async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function constraintExists(tableName: string, constraintName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints WHERE table_schema = current_schema() AND table_name = $1 AND constraint_name = $2`,
    [tableName, constraintName]
  );
  return res.rows.length > 0;
}

const SEED_RULES = BANK_ACCOUNT_RULES_SEED.rules;

async function addBankAccountRulesTables() {
  try {
    console.log('🔧 Adding bank account rules tables...');

    if (!(await tableExists('tbl_bank_account_rules'))) {
      await pool.query(`
        CREATE TABLE tbl_bank_account_rules (
          id serial PRIMARY KEY,
          bank_name varchar(100) NOT NULL UNIQUE,
          aliases text[] NOT NULL,
          lengths integer[] NOT NULL,
          prefixes jsonb,
          display_order integer NOT NULL DEFAULT 0,
          is_active boolean NOT NULL DEFAULT true,
          updated_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now(),
          CONSTRAINT tbl_bank_account_rules_aliases_not_empty CHECK (cardinality(aliases) > 0),
          CONSTRAINT tbl_bank_account_rules_lengths_not_empty CHECK (cardinality(lengths) > 0),
          CONSTRAINT tbl_bank_account_rules_prefixes_object CHECK (prefixes IS NULL OR jsonb_typeof(prefixes) = 'object')
        )
      `);
      console.log('  ✓ Created tbl_bank_account_rules table');
    } else {
      console.log('  ✓ tbl_bank_account_rules table already exists');
    }

    let seededRules = 0;
    for (const [index, rule] of SEED_RULES.entries()) {
      const res = await pool.query(
        `INSERT INTO tbl_bank_account_rules (bank_name, aliases, lengths, prefixes, display_order)
              VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (bank_name) DO NOTHING`,
        [rule.bank, rule.aliases, rule.lengths, rule.prefixes ? JSON.stringify(rule.prefixes) : null, index + 1]
      );
      seededRules += res.rowCount ?? 0;
    }
    console.log(`  ✓ Seeded ${seededRules} bank rule(s) (${SEED_RULES.length - seededRules} already present - left untouched)`);

    if (!(await tableExists('tbl_bank_account_settings'))) {
      await pool.query(`
        CREATE TABLE tbl_bank_account_settings (
          id serial PRIMARY KEY,
          fallback_account_number_min integer NOT NULL DEFAULT 6,
          fallback_account_number_max integer NOT NULL DEFAULT 20,
          updated_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          updated_at timestamp DEFAULT now(),
          CONSTRAINT tbl_bank_account_settings_fallback_range
            CHECK (fallback_account_number_min > 0 AND fallback_account_number_min <= fallback_account_number_max)
        )
      `);
      console.log('  ✓ Created tbl_bank_account_settings table');
    } else {
      console.log('  ✓ tbl_bank_account_settings table already exists');
    }

    if (!(await constraintExists('tbl_bank_account_settings', 'tbl_bank_account_settings_singleton'))) {
      await pool.query(`
        ALTER TABLE tbl_bank_account_settings
          ADD CONSTRAINT tbl_bank_account_settings_singleton CHECK (id = 1)
      `);
      console.log('  ✓ Added singleton CHECK (id = 1)');
    } else {
      console.log('  ✓ Singleton CHECK already present');
    }

    const { fallbackAccountNumberMin: min, fallbackAccountNumberMax: max } = BANK_ACCOUNT_RULES_SEED;
    const seeded = await pool.query(
      `INSERT INTO tbl_bank_account_settings (id, fallback_account_number_min, fallback_account_number_max)
            VALUES (1, $1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [min, max]
    );
    console.log(
      (seeded.rowCount ?? 0) > 0
        ? `  ✓ Seeded default settings row (fallback ${min}-${max} digits)`
        : '  ✓ Settings row already exists - left untouched'
    );

    console.log('✅ Bank account rules schema is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding bank account rules schema:', error);
    process.exit(1);
  }
}

addBankAccountRulesTables();
