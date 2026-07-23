/**
 * Seed script: Create the initial Super Admin user
 *
 * Run AFTER the migration:
 *   npm run create:superadmin
 *
 * Set these env vars (or edit the defaults below) before running:
 *   SA_EMAIL    - super admin email     (default: superadmin@oxocareers.com)
 *   SA_PASSWORD - super admin password  (default: SuperAdmin@123)
 *   SA_FNAME    - first name            (default: Super)
 *   SA_LNAME    - last name             (default: Admin)
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { EmployeeModel } from '../models/Employee';
import { UserRole } from '../types';

// Goes through EmployeeModel (not raw INSERT/UPDATE) so email/first_name/
// last_name get encrypted and email_hash gets populated the same way the
// live app does it - see src/models/Employee.ts.
async function run() {
  const email    = process.env.SA_EMAIL    || 'superadmin@oxocareers.com';
  const firstName = process.env.SA_FNAME   || 'Super';
  const lastName  = process.env.SA_LNAME   || 'Admin';
  const employeeId = 'SA001';

  console.log(`[Seed] Creating Super Admin: ${email}`);

  try {
    const existing = await EmployeeModel.findByEmail(email);

    if (existing) {
      if (existing.role === UserRole.SUPER_ADMIN) {
        console.log(`[Seed] ✅ Super Admin already exists (id=${existing.id}). Nothing to do.`);
        return;
      }
      await EmployeeModel.update(existing.id, { role: UserRole.SUPER_ADMIN });
      console.log(`[Seed] ✅ Upgraded existing user (id=${existing.id}) to super_admin.`);
      return;
    }

    const created = await EmployeeModel.create({
      employee_id: employeeId,
      email,
      first_name: firstName,
      last_name: lastName,
      role: UserRole.SUPER_ADMIN,
    });

    console.log(`[Seed] ✅ Super Admin created successfully.`);
    console.log(`       ID:       ${created.id}`);
    console.log(`       Email:    ${email}`);
  } catch (err: any) {
    console.error('[Seed] ❌ Error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
