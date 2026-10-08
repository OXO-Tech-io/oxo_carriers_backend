import pool from '../config/database';

// Second batch of the tbl_ prefix convention - mirrors renameTablesToTblPrefix.ts
// (which handled the first batch: users, audit_logs, consultant_work_submissions,
// facilities, facility_bookings, user_permissions, leave_*, salary_*,
// medical_insurance_claims, vendors, payment_vouchers).
//
// This batch covers the HR/communications/events/forms modules added afterwards,
// which were never migrated to the tbl_ convention.
const TABLE_RENAMES: [string, string][] = [
  ['attachments', 'tbl_attachments'],
  ['communications', 'tbl_communications'],
  ['communication_recipients', 'tbl_communication_recipients'],
  ['employee_dependents', 'tbl_employee_dependents'],
  ['employee_education', 'tbl_employee_education'],
  ['employee_emergency_contacts', 'tbl_employee_emergency_contacts'],
  ['employee_nominees', 'tbl_employee_nominees'],
  ['employee_notes', 'tbl_employee_notes'],
  ['employee_welfare_info', 'tbl_employee_welfare_info'],
  ['employee_work_history', 'tbl_employee_work_history'],
  ['events', 'tbl_events'],
  ['event_participants', 'tbl_event_participants'],
  ['forms', 'tbl_forms'],
  ['form_fields', 'tbl_form_fields'],
  ['form_distributions', 'tbl_form_distributions'],
  ['form_responses', 'tbl_form_responses'],
  ['form_response_answers', 'tbl_form_response_answers'],
  ['notifications', 'tbl_notifications'],
  ['profile_change_requests', 'tbl_profile_change_requests'],
  ['work_logs', 'tbl_work_logs'],
];

async function tableExists(name: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [name]
  );
  return (result.rowCount ?? 0) > 0;
}

async function renameTablesToTblPrefixBatch2() {
  try {
    console.log('🔧 Renaming batch-2 legacy tables to the tbl_ prefix convention...');

    for (const [oldName, newName] of TABLE_RENAMES) {
      const oldExists = await tableExists(oldName);
      const newExists = await tableExists(newName);
      if (newExists) {
        console.log(`  ✓ ${newName} already exists`);
        continue;
      }
      if (!oldExists) {
        console.log(`  - ${oldName} not found, skipping`);
        continue;
      }
      await pool.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
      console.log(`  ✓ Renamed ${oldName} -> ${newName}`);
    }

    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

renameTablesToTblPrefixBatch2();
