import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addProfileEnhancementFields.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// Adds the remaining REQ_19JUL26_A1 User Profile fields that weren't yet
// captured anywhere: calling name, religion, secondary contact, address
// sub-fields, extended spouse/parent/sibling details, medical info, LinkedIn,
// declaration on tbl_employee_pii; work_location on tbl_employee; school on
// tbl_employee_dependents.
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

async function addColumn(table: string, column: string, ddl: string) {
  if (!(await columnExists(table, column))) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`  ✓ Added ${table}.${column}`);
  } else {
    console.log(`  ✓ ${table}.${column} already exists`);
  }
}

async function addExtendedPersonalDetailsFields() {
  try {
    console.log('🔧 Adding extended personal details fields (calling name, religion, work location, extended family, health, social, declaration)...');

    if (!(await enumExists('work_location'))) {
      await pool.query(`CREATE TYPE work_location AS ENUM ('office', 'remote', 'hybrid')`);
      console.log('  ✓ Created work_location enum');
    } else {
      console.log('  ✓ work_location enum already exists');
    }
    await addColumn('tbl_employee', 'work_location', 'work_location work_location');

    const piiColumns: [string, string][] = [
      ['calling_name', 'calling_name bytea'],
      ['religion', 'religion varchar(100)'],
      ['spouse_nic', 'spouse_nic bytea'],
      ['spouse_date_of_birth', 'spouse_date_of_birth date'],
      ['spouse_contact_number', 'spouse_contact_number bytea'],
      ['spouse_occupation', 'spouse_occupation bytea'],
      ['mother_occupation', 'mother_occupation bytea'],
      ['mother_contact_number', 'mother_contact_number bytea'],
      ['father_occupation', 'father_occupation bytea'],
      ['father_contact_number', 'father_contact_number bytea'],
      ['sibling_details', 'sibling_details text'],
      ['primary_school', 'primary_school varchar(255)'],
      ['secondary_school', 'secondary_school varchar(255)'],
      ['secondary_contact_number', 'secondary_contact_number bytea'],
      ['grama_niladari_division', 'grama_niladari_division varchar(150)'],
      ['electorate', 'electorate varchar(150)'],
      ['postal_code', 'postal_code varchar(20)'],
      ['medical_conditions', 'medical_conditions bytea'],
      ['allergies', 'allergies bytea'],
      ['linkedin_profile', 'linkedin_profile varchar(255)'],
      ['additional_notes', 'additional_notes text'],
      ['declaration_accepted', "declaration_accepted boolean DEFAULT false"],
      ['declaration_accepted_at', 'declaration_accepted_at timestamp'],
    ];
    for (const [column, ddl] of piiColumns) {
      await addColumn('tbl_employee_pii', column, ddl);
    }

    await addColumn('tbl_employee_dependents', 'school', 'school bytea');

    console.log('✅ Extended personal details fields are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding extended personal details fields:', error);
    process.exit(1);
  }
}

addExtendedPersonalDetailsFields();
