/**
 * Migration: Add 'super_admin' to the users.role ENUM
 *
 * Run once against your live database:
 *   npm run migrate:superadmin
 *
 * Safe to run multiple times (checks current ENUM before altering).
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import pool from '../config/database';

async function run() {
  const connection = await (pool as any).getConnection();
  try {
    console.log('[Migration] Checking current role ENUM...');

    // Read the current ENUM values from information_schema
    const [rows] = await connection.execute<any[]>(`
      SELECT COLUMN_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'users'
        AND COLUMN_NAME  = 'role'
      LIMIT 1
    `);

    if (!rows.length) {
      console.error('[Migration] ❌ Could not find users.role column in the database.');
      process.exit(1);
    }

    const currentType: string = rows[0].COLUMN_TYPE;
    console.log(`[Migration] Current ENUM: ${currentType}`);

    if (currentType.includes("'super_admin'")) {
      console.log("[Migration] ✅ 'super_admin' already exists in the ENUM — no changes needed.");
      return;
    }

    // Build the new ENUM by inserting 'super_admin' at the front
    // Current format: enum('hr_manager','hr_executive',...)
    const newType = currentType.replace(
      /^enum\(/i,
      "enum('super_admin',"
    );

    console.log(`[Migration] Applying new ENUM: ${newType}`);
    await connection.execute(`
      ALTER TABLE users
        MODIFY COLUMN role ${newType} NOT NULL
    `);

    console.log("[Migration] ✅ Successfully added 'super_admin' to users.role ENUM.");
    console.log('[Migration] You can now create a super_admin user via the database or a seed script.');
  } catch (err: any) {
    console.error('[Migration] ❌ Error:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

run();
