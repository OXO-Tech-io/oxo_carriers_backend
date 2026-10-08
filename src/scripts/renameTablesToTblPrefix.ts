import pool from '../config/database';

const TABLE_RENAMES: [string, string][] = [
  ['users', 'tbl_employee'],
  ['audit_logs', 'tbl_audit_logs'],
  ['consultant_work_submissions', 'tbl_consultant_work_submissions'],
  ['facilities', 'tbl_facilities'],
  ['facility_bookings', 'tbl_facility_bookings'],
  ['user_permissions', 'tbl_user_permissions'],
  ['employee_leave_balance', 'tbl_employee_leave_balance'],
  ['leave_calendar', 'tbl_leave_calendar'],
  ['leave_requests', 'tbl_leave_requests'],
  ['leave_types', 'tbl_leave_types'],
  ['employee_salary_structure', 'tbl_employee_salary_structure'],
  ['monthly_salaries', 'tbl_monthly_salaries'],
  ['salary_components', 'tbl_salary_components'],
  ['salary_slip_details', 'tbl_salary_slip_details'],
  ['medical_insurance_claims', 'tbl_medical_insurance_claims'],
  ['vendors', 'tbl_vendors'],
  ['payment_vouchers', 'tbl_payment_vouchers'],
];

async function tableExists(name: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [name]
  );
  return (result.rowCount ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (result.rowCount ?? 0) > 0;
}

async function constraintExists(name: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = current_schema() AND constraint_name = $1`,
    [name]
  );
  return (result.rowCount ?? 0) > 0;
}

async function renameTablesToTblPrefix() {
  try {
    console.log('🔧 Renaming legacy tables to the tbl_ prefix convention...');

    for (const [oldName, newName] of TABLE_RENAMES) {
      const oldExists = await tableExists(oldName);
      const newExists = await tableExists(newName);
      if (newExists) {
        console.log(`  ✓ ${newName} already exists`);
        continue;
      }
      if (!oldExists) {
        console.log(`  - ${oldName} not found, skipping`);
        continue;
      }
      await pool.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
      console.log(`  ✓ Renamed ${oldName} -> ${newName}`);
    }

    console.log('🔧 Creating tbl_employee_type...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "tbl_employee_type" (
        "id" serial PRIMARY KEY,
        "name" varchar(50) NOT NULL UNIQUE,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);
    console.log('  ✓ tbl_employee_type ready');

    if (!(await columnExists('tbl_employee', 'employee_type_id'))) {
      await pool.query(`
        ALTER TABLE "tbl_employee"
        ADD COLUMN "employee_type_id" integer REFERENCES "tbl_employee_type"("id")
      `);
      console.log('  ✓ Added tbl_employee.employee_type_id');
    } else {
      console.log('  ✓ tbl_employee.employee_type_id already exists');
    }

    console.log('🔧 Swapping tbl_consultant_work_submissions.user_id -> employee_id...');
    if (!(await columnExists('tbl_consultant_work_submissions', 'employee_id'))) {
      await pool.query(`ALTER TABLE "tbl_consultant_work_submissions" ADD COLUMN "employee_id" varchar(50)`);
      console.log('  ✓ Added employee_id column');
    }

    if (await columnExists('tbl_consultant_work_submissions', 'user_id')) {
      await pool.query(`
        UPDATE "tbl_consultant_work_submissions" c
        SET "employee_id" = e."employee_id"
        FROM "tbl_employee" e
        WHERE c."user_id" = e."id" AND c."employee_id" IS NULL
      `);
      console.log('  ✓ Backfilled employee_id from user_id');

      await pool.query(`ALTER TABLE "tbl_consultant_work_submissions" ALTER COLUMN "employee_id" SET NOT NULL`);

      const fkName = 'tbl_consultant_work_submissions_employee_id_tbl_employee_employee_id_fk';
      if (!(await constraintExists(fkName))) {
        await pool.query(`
          ALTER TABLE "tbl_consultant_work_submissions"
          ADD CONSTRAINT "${fkName}"
          FOREIGN KEY ("employee_id") REFERENCES "tbl_employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        console.log('  ✓ Added employee_id FK constraint');
      }

      await pool.query(`ALTER TABLE "tbl_consultant_work_submissions" DROP COLUMN "user_id"`);
      console.log('  ✓ Dropped legacy user_id column');
    } else {
      console.log('  ✓ user_id already removed');
    }

    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

renameTablesToTblPrefix();
