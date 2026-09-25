import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors addPersonalEmailColumn.ts.
// Adds tbl_employee.profile_picture_url (OCD-454 - "My Profile" camera-icon
// upload), matching the new `profilePictureUrl` column in employee.schema.ts.
async function addProfilePictureUrlColumn() {
  try {
    console.log('🔧 Adding tbl_employee.profile_picture_url column...');

    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'tbl_employee'
        AND column_name = 'profile_picture_url'
    `);
    if (colRes.rows.length === 0) {
      await pool.query(`ALTER TABLE tbl_employee ADD COLUMN profile_picture_url varchar(500)`);
      console.log('  ✓ Added tbl_employee.profile_picture_url');
    } else {
      console.log('  ✓ tbl_employee.profile_picture_url already exists');
    }

    console.log('✅ tbl_employee.profile_picture_url is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding tbl_employee.profile_picture_url column:', error);
    process.exit(1);
  }
}

addProfilePictureUrlColumn();
