import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the
// addWorkLogMinutesAndEditTracking.ts pattern (see that file for why this
// doesn't go through `drizzle-kit generate`).
//
// Creates tbl_role_permissions (the DB-backed "what does this role get by
// default" template that used to be the hardcoded DEFAULT_PERMISSIONS_BY_ROLE
// constant in src/common/constants/defaultRolePermissions.ts) and seeds it
// with that constant's exact former values, so behavior is unchanged for
// every existing role until an admin edits it via the new Role Defaults
// screen. Only seeds if the table is empty, so re-running this script (or
// running it after an admin has already customized a role) is a no-op.

type Grant = { role: string; key: string; accessLevel: 'read' | 'write' };

// Copied verbatim from the now-removed defaultRolePermissions.ts - this is
// the one-time seed, not a runtime source of truth anymore.
const SEED_GRANTS: Grant[] = [
  // employee
  { role: 'employee', key: 'dashboard', accessLevel: 'read' },
  { role: 'employee', key: 'leaves', accessLevel: 'read' },
  { role: 'employee', key: 'salaries', accessLevel: 'read' },
  { role: 'employee', key: 'facilities', accessLevel: 'read' },
  { role: 'employee', key: 'medical_claims', accessLevel: 'read' },
  { role: 'employee', key: 'reports', accessLevel: 'read' },
  { role: 'employee', key: 'work_logs', accessLevel: 'read' },
  { role: 'employee', key: 'communications', accessLevel: 'read' },
  { role: 'employee', key: 'forms', accessLevel: 'read' },
  { role: 'employee', key: 'document_vault', accessLevel: 'read' },

  // hr_manager
  { role: 'hr_manager', key: 'dashboard', accessLevel: 'read' },
  { role: 'hr_manager', key: 'users', accessLevel: 'write' },
  { role: 'hr_manager', key: 'profile_change_requests', accessLevel: 'write' },
  { role: 'hr_manager', key: 'employee_notes', accessLevel: 'write' },
  { role: 'hr_manager', key: 'leaves', accessLevel: 'write' },
  { role: 'hr_manager', key: 'salaries', accessLevel: 'write' },
  { role: 'hr_manager', key: 'facilities', accessLevel: 'write' },
  { role: 'hr_manager', key: 'medical_claims', accessLevel: 'write' },
  { role: 'hr_manager', key: 'consultant_submissions', accessLevel: 'write' },
  { role: 'hr_manager', key: 'reports', accessLevel: 'write' },
  { role: 'hr_manager', key: 'communications', accessLevel: 'write' },
  { role: 'hr_manager', key: 'events', accessLevel: 'write' },
  { role: 'hr_manager', key: 'forms', accessLevel: 'write' },
  { role: 'hr_manager', key: 'work_logs', accessLevel: 'write' },
  { role: 'hr_manager', key: 'groups', accessLevel: 'write' },
  { role: 'hr_manager', key: 'notices', accessLevel: 'write' },
  { role: 'hr_manager', key: 'attendance', accessLevel: 'read' },
  { role: 'hr_manager', key: 'document_vault', accessLevel: 'write' },
  { role: 'hr_manager', key: 'archive', accessLevel: 'read' },

  // hr_executive
  { role: 'hr_executive', key: 'dashboard', accessLevel: 'read' },
  { role: 'hr_executive', key: 'users', accessLevel: 'write' },
  { role: 'hr_executive', key: 'employee_notes', accessLevel: 'write' },
  { role: 'hr_executive', key: 'leaves', accessLevel: 'write' },
  { role: 'hr_executive', key: 'salaries', accessLevel: 'write' },
  { role: 'hr_executive', key: 'facilities', accessLevel: 'write' },
  { role: 'hr_executive', key: 'medical_claims', accessLevel: 'write' },
  { role: 'hr_executive', key: 'consultant_submissions', accessLevel: 'write' },
  { role: 'hr_executive', key: 'reports', accessLevel: 'write' },
  { role: 'hr_executive', key: 'communications', accessLevel: 'write' },
  { role: 'hr_executive', key: 'events', accessLevel: 'write' },
  { role: 'hr_executive', key: 'forms', accessLevel: 'write' },
  { role: 'hr_executive', key: 'groups', accessLevel: 'write' },
  { role: 'hr_executive', key: 'notices', accessLevel: 'write' },
  { role: 'hr_executive', key: 'attendance', accessLevel: 'read' },
  { role: 'hr_executive', key: 'document_vault', accessLevel: 'write' },

  // finance_manager
  { role: 'finance_manager', key: 'dashboard', accessLevel: 'read' },
  { role: 'finance_manager', key: 'users', accessLevel: 'read' },
  { role: 'finance_manager', key: 'leaves', accessLevel: 'read' },
  { role: 'finance_manager', key: 'salaries', accessLevel: 'read' },
  { role: 'finance_manager', key: 'facilities', accessLevel: 'read' },
  { role: 'finance_manager', key: 'medical_claims', accessLevel: 'write' },
  { role: 'finance_manager', key: 'communications', accessLevel: 'read' },
  { role: 'finance_manager', key: 'forms', accessLevel: 'read' },
  { role: 'finance_manager', key: 'document_vault', accessLevel: 'read' },
  { role: 'finance_manager', key: 'vouchers.view', accessLevel: 'write' },
  { role: 'finance_manager', key: 'vouchers.create', accessLevel: 'write' },
  { role: 'finance_manager', key: 'vouchers.resubmit', accessLevel: 'write' },
  { role: 'finance_manager', key: 'vouchers.bank_upload', accessLevel: 'write' },
  { role: 'finance_manager', key: 'vouchers.mark_paid', accessLevel: 'write' },

  // finance_executive
  { role: 'finance_executive', key: 'dashboard', accessLevel: 'read' },
  { role: 'finance_executive', key: 'users', accessLevel: 'read' },
  { role: 'finance_executive', key: 'leaves', accessLevel: 'read' },
  { role: 'finance_executive', key: 'salaries', accessLevel: 'read' },
  { role: 'finance_executive', key: 'facilities', accessLevel: 'read' },
  { role: 'finance_executive', key: 'medical_claims', accessLevel: 'write' },
  { role: 'finance_executive', key: 'communications', accessLevel: 'read' },
  { role: 'finance_executive', key: 'forms', accessLevel: 'read' },
  { role: 'finance_executive', key: 'document_vault', accessLevel: 'read' },
  { role: 'finance_executive', key: 'vouchers.view', accessLevel: 'read' },
  { role: 'finance_executive', key: 'vouchers.review', accessLevel: 'write' },

  // consultant
  { role: 'consultant', key: 'dashboard', accessLevel: 'read' },
  { role: 'consultant', key: 'consultant_submissions', accessLevel: 'read' },
  { role: 'consultant', key: 'salaries', accessLevel: 'read' },
  { role: 'consultant', key: 'communications', accessLevel: 'read' },
  { role: 'consultant', key: 'forms', accessLevel: 'read' },
  { role: 'consultant', key: 'document_vault', accessLevel: 'read' },
];

async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName],
  );
  return res.rows.length > 0;
}

async function addRolePermissionsTable() {
  try {
    console.log('🔧 Creating tbl_role_permissions...');

    if (!(await tableExists('tbl_role_permissions'))) {
      await pool.query(`
        CREATE TABLE tbl_role_permissions (
          id serial PRIMARY KEY,
          role varchar(50) NOT NULL,
          permission_key varchar(100) NOT NULL,
          access_level access_level NOT NULL DEFAULT 'read',
          updated_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now(),
          CONSTRAINT tbl_role_permissions_role_key_unique UNIQUE (role, permission_key)
        )
      `);
      console.log('  ✓ Created tbl_role_permissions');
    } else {
      console.log('  ✓ tbl_role_permissions already exists');
    }

    const countRes = await pool.query('SELECT COUNT(*) FROM tbl_role_permissions');
    const existingCount = Number.parseInt(countRes.rows[0]?.count || '0', 10);

    if (existingCount === 0) {
      const roles = SEED_GRANTS.map((g) => g.role);
      const keys = SEED_GRANTS.map((g) => g.key);
      const levels = SEED_GRANTS.map((g) => g.accessLevel);
      await pool.query(
        `INSERT INTO tbl_role_permissions (role, permission_key, access_level)
         SELECT r, k, l::access_level
         FROM unnest($1::varchar[], $2::varchar[], $3::varchar[]) AS x(r, k, l)`,
        [roles, keys, levels],
      );
      console.log(`  ✓ Seeded ${SEED_GRANTS.length} default role permission grant(s)`);
    } else {
      console.log(`  ✓ tbl_role_permissions already has ${existingCount} row(s) - skipping seed`);
    }

    console.log('✅ tbl_role_permissions schema is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating tbl_role_permissions:', error);
    process.exit(1);
  }
}

addRolePermissionsTable();
