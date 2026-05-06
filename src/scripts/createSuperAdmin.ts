/**
 * Seed script: Create the initial Super Admin user
 *
 * Run AFTER the migration:
 *   npm run migrate:superadmin
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

import bcrypt from 'bcryptjs';
import pool from '../config/database';
import { UserRole } from '../types';

async function run() {
  const email    = process.env.SA_EMAIL    || 'superadmin@oxocareers.com';
  const password = process.env.SA_PASSWORD || 'SuperAdmin@123';
  const firstName = process.env.SA_FNAME   || 'Super';
  const lastName  = process.env.SA_LNAME   || 'Admin';
  const employeeId = 'SA001';

  console.log(`[Seed] Creating Super Admin: ${email}`);

  const connection = await (pool as any).getConnection();
  try {
    // Check if user already exists
    const [existing] = await connection.execute<any[]>(
      'SELECT id, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length > 0) {
      const user = existing[0];
      if (user.role === UserRole.SUPER_ADMIN) {
        console.log(`[Seed] ✅ Super Admin already exists (id=${user.id}). Nothing to do.`);
        return;
      }
      // Upgrade existing user to super_admin
      await connection.execute(
        "UPDATE users SET role = 'super_admin', must_change_password = 0 WHERE id = ?",
        [user.id]
      );
      console.log(`[Seed] ✅ Upgraded existing user (id=${user.id}) to super_admin.`);
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await connection.execute<any>(
      `INSERT INTO users
         (employee_id, email, password, first_name, last_name, role, must_change_password, email_verified)
       VALUES (?, ?, ?, ?, ?, 'super_admin', 0, 1)`,
      [employeeId, email, hashedPassword, firstName, lastName]
    );

    console.log(`[Seed] ✅ Super Admin created successfully.`);
    console.log(`       ID:       ${result.insertId}`);
    console.log(`       Email:    ${email}`);
    console.log(`       Password: ${password}`);
    console.log(`       ⚠️  Change this password immediately after first login!`);
  } catch (err: any) {
    console.error('[Seed] ❌ Error:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

run();
