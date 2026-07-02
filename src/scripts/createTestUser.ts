import pool from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

async function createTestUser() {
  try {
    const email = 'test@gmail.com';

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    const existingUsers = existing.rows as any[];

    if (existingUsers.length > 0) {
      console.log('User already exists.');
    } else {
      // Create new user
      const employeeId = `EMP${new Date().getFullYear()}0001`;
      await pool.query(
        `INSERT INTO users (employee_id, email, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, 'hr_manager')`,
        [employeeId, email, 'Test', 'User']
      );
      console.log('✅ Test user created successfully!');
    }

    console.log('\n📋 Login Credentials:');
    console.log('   Email: test@gmail.com');
    console.log('   Role: HR Manager\n');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating test user:', error.message);
    process.exit(1);
  }
}

createTestUser();
