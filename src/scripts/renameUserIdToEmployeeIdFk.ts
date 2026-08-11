import pool from '../config/database';

// Converts the leftover `user_id` (integer, references tbl_employee.id) FK
// column - a naming leftover from when tbl_employee was called `users` - to
// a business `employee_id` (varchar(50), references tbl_employee.employee_id)
// FK, on every table where that FK identifies "the employee this row is
// about" (as opposed to an actor/creator/reviewer-tracking column, which
// intentionally stays a numeric tbl_employee.id FK - e.g. created_by,
// reviewed_by, generated_by, recorded_by, submitted_by, author_user_id).
//
// Mirrors the exact pattern already applied to tbl_consultant_work_submissions
// by drizzle/0009_tbl_prefix_and_employee_type.sql / renameTablesToTblPrefix.ts:
//   1. add nullable employee_id varchar(50) column
//   2. backfill employee_id from the employee row matched by the old user_id
//   3. set NOT NULL (skipped for tables whose user_id was already nullable)
//   4. add the FK constraint
//   5. drop the old user_id column (and any constraint/index tied to it)

interface TableSpec {
  table: string;
  oldColumn: string;
  notNull: boolean;
  /** Extra unique index to (re)create on employee_id after the swap, keyed by the other column(s) it pairs with. */
  uniqueWith?: string[];
}

const TABLES: TableSpec[] = [
  { table: 'tbl_employee_dependents', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_employee_education', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_employee_emergency_contacts', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_employee_nominees', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_employee_welfare_info', oldColumn: 'user_id', notNull: true, uniqueWith: [] },
  { table: 'tbl_employee_work_history', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_employee_notes', oldColumn: 'employee_user_id', notNull: true },
  { table: 'tbl_communication_recipients', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_event_participants', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_notifications', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_work_logs', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_form_distributions', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_form_responses', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_group_members', oldColumn: 'user_id', notNull: true, uniqueWith: ['group_id'] },
  { table: 'tbl_user_permissions', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_employee_leave_balance', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_leave_requests', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_employee_salary_structure', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_monthly_salaries', oldColumn: 'user_id', notNull: true, uniqueWith: ['month_year'] },
  { table: 'tbl_medical_insurance_claims', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_payment_vouchers', oldColumn: 'user_id', notNull: false },
  { table: 'tbl_facility_bookings', oldColumn: 'user_id', notNull: true },
  { table: 'tbl_profile_change_requests', oldColumn: 'user_id', notNull: true },
];

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

async function migrateTable(spec: TableSpec) {
  const { table, oldColumn, notNull, uniqueWith } = spec;

  if (!(await columnExists(table, oldColumn))) {
    console.log(`  - ${table}.${oldColumn} not found, skipping (already migrated or table not present)`);
    return;
  }

  if (!(await columnExists(table, 'employee_id'))) {
    await pool.query(`ALTER TABLE "${table}" ADD COLUMN "employee_id" varchar(50)`);
    console.log(`  + ${table}: added employee_id column`);
  }

  await pool.query(`
    UPDATE "${table}" t
    SET "employee_id" = e."employee_id"
    FROM "tbl_employee" e
    WHERE t."${oldColumn}" = e."id" AND t."employee_id" IS NULL
  `);
  console.log(`  ~ ${table}: backfilled employee_id from ${oldColumn}`);

  if (notNull) {
    await pool.query(`ALTER TABLE "${table}" ALTER COLUMN "employee_id" SET NOT NULL`);
  }

  const fkName = `${table}_employee_id_tbl_employee_employee_id_fk`;
  if (!(await constraintExists(fkName))) {
    await pool.query(`
      ALTER TABLE "${table}"
      ADD CONSTRAINT "${fkName}"
      FOREIGN KEY ("employee_id") REFERENCES "tbl_employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log(`  + ${table}: added employee_id FK constraint`);
  }

  await pool.query(`ALTER TABLE "${table}" DROP COLUMN "${oldColumn}"`);
  console.log(`  - ${table}: dropped legacy ${oldColumn} column`);

  if (uniqueWith) {
    const cols = ['employee_id', ...uniqueWith];
    const idxName = `${table}_${cols.join('_')}_idx`;
    const quotedCols = cols.map(c => `"${c}"`).join(', ');
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "${idxName}" ON "${table}" (${quotedCols})`);
    console.log(`  + ${table}: ensured unique index on (${cols.join(', ')})`);
  }
}

async function run() {
  try {
    console.log('🔧 Converting legacy user_id FKs to business employee_id FKs...');
    for (const spec of TABLES) {
      await migrateTable(spec);
    }
    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

run();
