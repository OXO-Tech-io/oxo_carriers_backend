import pool from '../config/database';
import { env } from '../config/env';

// Idempotent, additive-only migration script - mirrors the
// addProfileEnhancementFields.ts / addHrModulesTables.ts pattern (see those
// files for why this doesn't go through `drizzle-kit generate`).
// Adds the fields for the 5-tab Employee Profile overhaul:
//   Tab 1 (statutory): tbl_employee_pii scalar columns + employee_nominees
//   Tab B (remittance): tbl_employee.bank_branch_code/swift_code + residing address/landline on tbl_employee_pii
//   Tab C (medical/welfare dependents): employee_dependents
//   Tab D (emergency contacts): employee_emergency_contacts (+ backfill from the old singleton columns)
//   Tab E (welfare): employee_welfare_info
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

async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function addProfileTabFields() {
  try {
    console.log('🔧 Adding profile tab fields (statutory, remittance, dependents, emergency contacts, welfare)...');

    if (!(await enumExists('employee_sex'))) {
      await pool.query(`CREATE TYPE employee_sex AS ENUM ('male', 'female')`);
      console.log('  ✓ Created employee_sex enum');
    } else {
      console.log('  ✓ employee_sex enum already exists');
    }

    if (!(await enumExists('marital_status'))) {
      await pool.query(`CREATE TYPE marital_status AS ENUM ('married', 'single')`);
      console.log('  ✓ Created marital_status enum');
    } else {
      console.log('  ✓ marital_status enum already exists');
    }

    if (!(await enumExists('dependent_relationship'))) {
      await pool.query(`CREATE TYPE dependent_relationship AS ENUM ('spouse', 'child')`);
      console.log('  ✓ Created dependent_relationship enum');
    } else {
      console.log('  ✓ dependent_relationship enum already exists');
    }

    const piiColumns: [string, string][] = [
      ['full_name_as_nic', 'bytea'],
      ['name_with_initials', 'bytea'],
      ['date_of_birth', 'date'],
      ['birth_place', 'bytea'],
      ['sex', 'employee_sex'],
      ['marital_status', 'marital_status'],
      ['nationality', 'varchar(100)'],
      ['spouse_name', 'bytea'],
      ['mother_name', 'bytea'],
      ['father_name', 'bytea'],
      ['residing_address_line1', 'bytea'],
      ['residing_address_line2', 'bytea'],
      ['residing_city', 'bytea'],
      ['residing_district', 'bytea'],
      ['landline_number', 'bytea'],
    ];
    for (const [column, type] of piiColumns) {
      if (!(await columnExists('tbl_employee_pii', column))) {
        await pool.query(`ALTER TABLE tbl_employee_pii ADD COLUMN ${column} ${type}`);
        console.log(`  ✓ Added tbl_employee_pii.${column}`);
      } else {
        console.log(`  ✓ tbl_employee_pii.${column} already exists`);
      }
    }

    const userColumns: [string, string][] = [
      ['bank_branch_code', 'varchar(30)'],
      ['swift_code', 'varchar(30)'],
    ];
    for (const [column, type] of userColumns) {
      if (!(await columnExists('tbl_employee', column))) {
        await pool.query(`ALTER TABLE tbl_employee ADD COLUMN ${column} ${type}`);
        console.log(`  ✓ Added tbl_employee.${column}`);
      } else {
        console.log(`  ✓ tbl_employee.${column} already exists`);
      }
    }

    if (!(await tableExists('employee_nominees'))) {
      await pool.query(`
        CREATE TABLE employee_nominees (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          name_with_initials bytea,
          nic bytea,
          relationship varchar(100) NOT NULL,
          proportion_percent decimal(5, 2) NOT NULL,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created employee_nominees table');
    } else {
      console.log('  ✓ employee_nominees table already exists');
    }

    if (!(await tableExists('employee_dependents'))) {
      await pool.query(`
        CREATE TABLE employee_dependents (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          full_name bytea,
          nic bytea,
          date_of_birth date NOT NULL,
          gender employee_sex NOT NULL,
          relationship dependent_relationship NOT NULL,
          mobile_number bytea,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created employee_dependents table');
    } else {
      console.log('  ✓ employee_dependents table already exists');
    }

    if (!(await tableExists('employee_emergency_contacts'))) {
      await pool.query(`
        CREATE TABLE employee_emergency_contacts (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          name bytea,
          relationship varchar(100) NOT NULL,
          contact_number bytea,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created employee_emergency_contacts table');

      // Backfill: carry forward the old single emergency contact (if any)
      // from tbl_employee_pii as each employee's first record, so no data
      // is lost when the UI switches to the multi-record table. Both tables
      // encrypt with the same pgp_sym_encrypt/PII_ENCRYPTION_KEY mechanism,
      // so the bytea name/phone columns are copied as-is (no decrypt/re-encrypt
      // needed); only the relationship column changes shape (bytea -> plain
      // varchar) and must be decrypted.
      const key = env.PII_ENCRYPTION_KEY || 'default-pii-encryption-key-must-change-in-prod';
      const backfill = await pool.query(
        `
        INSERT INTO employee_emergency_contacts (user_id, name, relationship, contact_number)
        SELECT u.id, p.emergency_contact_name,
               COALESCE(NULLIF(pgp_sym_decrypt(p.emergency_contact_relationship, $1), ''), 'Not specified'),
               p.emergency_contact_phone
        FROM tbl_employee_pii p
        JOIN tbl_employee u ON u.employee_id = p.employee_id
        WHERE p.emergency_contact_name IS NOT NULL
        `,
        [key]
      );
      console.log(`  ✓ Backfilled ${backfill.rowCount} legacy emergency contact(s) into employee_emergency_contacts`);
    } else {
      console.log('  ✓ employee_emergency_contacts table already exists');
    }

    if (!(await tableExists('employee_welfare_info'))) {
      await pool.query(`
        CREATE TABLE employee_welfare_info (
          id serial PRIMARY KEY,
          user_id integer NOT NULL UNIQUE REFERENCES tbl_employee(id) ON DELETE CASCADE,
          wedding_anniversary_date date,
          hobbies text,
          community_activities text,
          professional_memberships text,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created employee_welfare_info table');
    } else {
      console.log('  ✓ employee_welfare_info table already exists');
    }

    console.log('✅ Profile tab fields are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding profile tab fields:', error);
    process.exit(1);
  }
}

addProfileTabFields();
