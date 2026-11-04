import pool from '../config/database';
import { EMPLOYMENT_TYPES } from '../common/constants/employmentTypes';

// Idempotent, additive-only migration script - mirrors addCareerPathColumn.ts.
// Adds the level-based values (apprentice, entry_level, mid_level, senior,
// staff_principal_lead, mid_management, executive) to the employment_type
// enum used by tbl_employee_work_history.employment_type. Existing values -
// including the legacy 'regular' - are untouched.
async function addEmploymentTypeValues() {
  try {
    console.log('🔧 Adding employment_type enum values...');

    const existing = await pool.query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'employment_type'`,
    );
    const have = new Set(existing.rows.map((r: { enumlabel: string }) => r.enumlabel));

    for (const value of EMPLOYMENT_TYPES) {
      if (have.has(value)) {
        console.log(`  ✓ employment_type '${value}' already exists`);
        continue;
      }
      // ADD VALUE can't run inside a transaction block on older Postgres; one statement per call is fine.
      await pool.query(`ALTER TYPE employment_type ADD VALUE IF NOT EXISTS '${value}'`);
      console.log(`  ✓ Added employment_type '${value}'`);
    }

    console.log('✅ employment_type enum is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding employment_type values:', error);
    process.exit(1);
  }
}

addEmploymentTypeValues();
