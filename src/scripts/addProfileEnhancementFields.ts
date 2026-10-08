import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addHrModulesTables.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// Adds: users.title, tbl_employee_pii structured address/blood type/emergency
// contact relationship columns, employee_education.is_ongoing,
// employee_work_history.employment_type.
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows.length > 0;
}

async function enumExists(typeName: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [typeName]);
  return res.rows.length > 0;
}

async function addProfileEnhancementFields() {
  try {
    console.log('🔧 Adding profile enhancement fields (title, structured address, blood type, ongoing education, employment type)...');

    if (!(await enumExists('user_title'))) {
      await pool.query(`CREATE TYPE user_title AS ENUM ('mr', 'ms', 'mrs', 'dr', 'prof')`);
      console.log('  ✓ Created user_title enum');
    } else {
      console.log('  ✓ user_title enum already exists');
    }

    if (!(await columnExists('tbl_employee', 'title'))) {
      await pool.query(`ALTER TABLE tbl_employee ADD COLUMN title user_title`);
      console.log('  ✓ Added tbl_employee.title');
    } else {
      console.log('  ✓ tbl_employee.title already exists');
    }

    const piiColumns: [string, string][] = [
      ['address_line1', 'bytea'],
      ['address_line2', 'bytea'],
      ['city', 'bytea'],
      ['district', 'bytea'],
      ['blood_type', 'bytea'],
      ['emergency_contact_relationship', 'bytea'],
    ];
    for (const [column, type] of piiColumns) {
      if (!(await columnExists('tbl_employee_pii', column))) {
        await pool.query(`ALTER TABLE tbl_employee_pii ADD COLUMN ${column} ${type}`);
        console.log(`  ✓ Added tbl_employee_pii.${column}`);
      } else {
        console.log(`  ✓ tbl_employee_pii.${column} already exists`);
      }
    }

    if (!(await columnExists('employee_education', 'is_ongoing'))) {
      await pool.query(`ALTER TABLE employee_education ADD COLUMN is_ongoing boolean DEFAULT false`);
      console.log('  ✓ Added employee_education.is_ongoing');
    } else {
      console.log('  ✓ employee_education.is_ongoing already exists');
    }

    if (!(await enumExists('employment_type'))) {
      await pool.query(`CREATE TYPE employment_type AS ENUM ('regular', 'intern', 'trainee')`);
      console.log('  ✓ Created employment_type enum');
    } else {
      console.log('  ✓ employment_type enum already exists');
    }

    if (!(await columnExists('employee_work_history', 'employment_type'))) {
      await pool.query(`ALTER TABLE employee_work_history ADD COLUMN employment_type employment_type NOT NULL DEFAULT 'regular'`);
      console.log('  ✓ Added employee_work_history.employment_type');
    } else {
      console.log('  ✓ employee_work_history.employment_type already exists');
    }

    console.log('✅ Profile enhancement fields are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding profile enhancement fields:', error);
    process.exit(1);
  }
}

addProfileEnhancementFields();
