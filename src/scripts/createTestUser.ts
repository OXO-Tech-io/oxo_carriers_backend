import dotenv from 'dotenv';
import { EmployeeModel } from '../employees/Employee';
import { UserRole } from '../types';

dotenv.config();

async function createTestUser() {
  try {
    const email = 'test@gmail.com';

    // Check if user already exists
    const existing = await EmployeeModel.findByEmail(email);

    if (existing) {
      console.log('User already exists.');
    } else {
      // Create new user - via EmployeeModel (not a raw insert) so
      // email/first_name/last_name get encrypted and email_hash gets
      // populated the same way the live app does it.
      const employeeId = `EMP${new Date().getFullYear()}0001`;
      await EmployeeModel.create({
        employee_id: employeeId,
        email,
        first_name: 'Test',
        last_name: 'User',
        role: UserRole.HR_MANAGER,
      });
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
