import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors addPersonalEmailColumn.ts.
// Adds the "Related Career Path" columns, matching the `careerPath` fields in
// employee.schema.ts and employeeWorkHistory.schema.ts:
//   - tbl_employee.career_path              (career path of the current designation)
//   - tbl_employee_work_history.career_path (career path of each past role)
const COLUMNS = [
  { table: 'tbl_employee', column: 'career_path', ddl: 'varchar(50)' },
  { table: 'tbl_employee_work_history', column: 'career_path', ddl: 'varchar(50)' },
];

async function addCareerPathColumns() {
  try {
    console.log('🔧 Adding career_path columns...');

    for (const { table, column, ddl } of COLUMNS) {
      const colRes = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
        [table, column],
      );
      if (colRes.rows.length === 0) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
        console.log(`  ✓ Added ${table}.${column}`);
      } else {
        console.log(`  ✓ ${table}.${column} already exists`);
      }
    }

    console.log('✅ career_path columns are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding career_path columns:', error);
    process.exit(1);
  }
}

addCareerPathColumns();
