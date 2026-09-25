/**
 * One-off dev script: create a QA test Super Admin employee row so the local
 * Keycloak user of the same email can log in and reach every role-gated page
 * (used to smoke-test the medical insurance changes end-to-end).
 *
 * Run: pnpm exec ts-node src/scripts/createQaTestUser.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { EmployeeModel } from '../employees/Employee';
import { UserRole } from '../types';

async function run() {
  const email = 'qa.superadmin@oxocarriers.local';
  const employeeId = 'QATEST01';

  const existing = await EmployeeModel.findByEmail(email);
  if (existing) {
    console.log(`[QA Seed] Already exists (id=${existing.id}).`);
    process.exit(0);
  }

  const created = await EmployeeModel.create({
    employee_id: employeeId,
    email,
    first_name: 'QA',
    last_name: 'SuperAdmin',
    role: UserRole.SUPER_ADMIN,
    hire_date: new Date('2023-01-01'),
  });

  console.log(`[QA Seed] Created employee id=${created.id}, employee_id=${employeeId}, email=${email}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('[QA Seed] Failed:', err);
  process.exit(1);
});
