import pool from '../config/database';

async function addSalaryColumns() {
  try {
    console.log('🔧 Adding local_salary and oxo_international_salary columns to monthly_salaries table...');

    // Check if columns already exist
    const columnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
      AND table_name = 'monthly_salaries'
      AND column_name IN ('local_salary', 'oxo_international_salary')
    `);

    const existingColumns = (columnsResult.rows as any[]).map(c => c.column_name);

    // Add local_salary column if it doesn't exist
    if (!existingColumns.includes('local_salary')) {
      await pool.query(`
        ALTER TABLE monthly_salaries
        ADD COLUMN local_salary DECIMAL(10,2) DEFAULT 0
      `);
      console.log('  ✓ Added local_salary column');
    } else {
      console.log('  ✓ local_salary column already exists');
    }

    // Add oxo_international_salary column if it doesn't exist
    if (!existingColumns.includes('oxo_international_salary')) {
      await pool.query(`
        ALTER TABLE monthly_salaries
        ADD COLUMN oxo_international_salary DECIMAL(10,2) DEFAULT 0
      `);
      console.log('  ✓ Added oxo_international_salary column');
    } else {
      console.log('  ✓ oxo_international_salary column already exists');
    }

    console.log('✅ Columns added successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding columns:', error);
    process.exit(1);
  }
}

addSalaryColumns();
