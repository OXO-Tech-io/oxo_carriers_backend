import pool from '../config/database';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function createTestUser() {
  try {
    const email = 'test@gmail.com';
    const password = 'admin@12';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if user already exists
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    const existingUsers = existing as any[];

    if (existingUsers.length > 0) {
      console.log('User already exists. Updating password...');
      await pool.execute(
        'UPDATE users SET password = ?, must_change_password = false WHERE email = ?',
        [hashedPassword, email]
      );
      console.log('✅ Password updated for test@gmail.com');
    } else {
      // Create new user
      const employeeId = `EMP${new Date().getFullYear()}0001`;
      await pool.execute(
        `INSERT INTO users (employee_id, email, password, first_name, last_name, role, must_change_password)
         VALUES (?, ?, ?, ?, ?, 'hr_manager', false)`,
        [employeeId, email, hashedPassword, 'Test', 'User']
      );
      console.log('✅ Test user created successfully!');
    }

    console.log('\n📋 Login Credentials:');
    console.log('   Email: test@gmail.com');
    console.log('   Password: admin@12');
    console.log('   Role: HR Manager\n');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating test user:', error.message);
    process.exit(1);
  }
}

createTestUser();
