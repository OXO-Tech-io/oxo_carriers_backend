import pool from '../config/database';

async function addSalaryColumns() {
  try {
    console.log('🔧 Adding local_salary and oxo_international_salary columns to monthly_salaries table...');
    
    // Check if columns already exist
    const [columns]: any = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'monthly_salaries' 
      AND COLUMN_NAME IN ('local_salary', 'oxo_international_salary')
    `);
    
    const existingColumns = columns.map((c: any) => c.COLUMN_NAME);
    
    // Add local_salary column if it doesn't exist
    if (!existingColumns.includes('local_salary')) {
      await pool.execute(`
        ALTER TABLE monthly_salaries 
        ADD COLUMN local_salary DECIMAL(10,2) DEFAULT 0 AFTER basic_salary
      `);
      console.log('  ✓ Added local_salary column');
    } else {
      console.log('  ✓ local_salary column already exists');
    }
    
    // Add oxo_international_salary column if it doesn't exist
    if (!existingColumns.includes('oxo_international_salary')) {
      await pool.execute(`
        ALTER TABLE monthly_salaries 
        ADD COLUMN oxo_international_salary DECIMAL(10,2) DEFAULT 0 AFTER local_salary
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
