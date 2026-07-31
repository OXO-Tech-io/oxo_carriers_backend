import pool from '../config/database';

// Idempotent, additive/destructive migration script - mirrors the
// widenBankCodeColumns.ts / addProfileTabFields.ts pattern (see those files
// for why this doesn't go through `drizzle-kit generate`).
//
// tbl_employee.email_verified / email_verification_token were part of a
// pre-Keycloak custom email-verification flow. Identity (including email
// verification) is now owned entirely by Keycloak - see
// keycloakAdminService.sendRequiredActionsEmail and UsersService.getAll,
// which surface Keycloak's own emailVerified flag instead. These columns
// have no remaining reader/writer in the app, so they're dropped here.
async function dropEmailVerificationColumns() {
  try {
    console.log('🔧 Dropping tbl_employee.email_verified / email_verification_token...');

    const res = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'tbl_employee'
        AND column_name IN ('email_verified', 'email_verification_token')
    `);

    const existing = new Set((res.rows as any[]).map((r) => r.column_name));

    if (existing.has('email_verified')) {
      await pool.query(`ALTER TABLE tbl_employee DROP COLUMN email_verified`);
      console.log('  ✓ Dropped email_verified');
    } else {
      console.log('  ✓ email_verified already absent');
    }

    if (existing.has('email_verification_token')) {
      await pool.query(`ALTER TABLE tbl_employee DROP COLUMN email_verification_token`);
      console.log('  ✓ Dropped email_verification_token');
    } else {
      console.log('  ✓ email_verification_token already absent');
    }

    console.log('✅ tbl_employee is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error dropping email verification columns:', error);
    process.exit(1);
  }
}

dropEmailVerificationColumns();
