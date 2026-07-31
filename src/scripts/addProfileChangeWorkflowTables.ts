import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addSalaryColumns.ts
// pattern already used in this repo for targeted schema changes that don't go
// through `drizzle-kit generate` (the tracked migration snapshot in
// drizzle/meta/ is out of sync with legacy `tbl_*`-prefixed table names, which
// makes `drizzle-kit generate` prompt an ambiguous rename-vs-create choice for
// every table, new or existing - too risky to answer blindly). The equivalent
// SQL is also kept at drizzle/0006_add_profile_change_workflow.sql for
// history, consistent with how 0004/0005 were handled.
async function addProfileChangeWorkflowTables() {
  try {
    console.log('🔧 Adding Profile Change Workflow tables and columns...');

    // 1. users.undergraduate_degree_completion_date
    const userColRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'tbl_employee'
        AND column_name = 'undergraduate_degree_completion_date'
    `);
    if (userColRes.rows.length === 0) {
      await pool.query(`ALTER TABLE tbl_employee ADD COLUMN undergraduate_degree_completion_date date`);
      console.log('  ✓ Added users.undergraduate_degree_completion_date');
    } else {
      console.log('  ✓ users.undergraduate_degree_completion_date already exists');
    }

    // 2. qualification_level enum + employee_education table
    const qualEnumRes = await pool.query(`SELECT 1 FROM pg_type WHERE typname = 'qualification_level'`);
    if (qualEnumRes.rows.length === 0) {
      await pool.query(`
        CREATE TYPE qualification_level AS ENUM (
          'certificate','advanced_certificate','diploma','advanced_diploma',
          'degree','postgraduate_diploma','masters','mphil','phd'
        )
      `);
      console.log('  ✓ Created qualification_level enum');
    } else {
      console.log('  ✓ qualification_level enum already exists');
    }

    const educationTableRes = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'employee_education'
    `);
    if (educationTableRes.rows.length === 0) {
      await pool.query(`
        CREATE TABLE employee_education (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          qualification_level qualification_level NOT NULL,
          qualification_title varchar(255) NOT NULL,
          awarding_institution varchar(255) NOT NULL,
          date_awarded date,
          remarks text,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created employee_education table');
    } else {
      console.log('  ✓ employee_education table already exists');
    }

    // 3. employee_work_history table
    const workHistoryTableRes = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'employee_work_history'
    `);
    if (workHistoryTableRes.rows.length === 0) {
      await pool.query(`
        CREATE TABLE employee_work_history (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          organization varchar(255) NOT NULL,
          position_held varchar(255) NOT NULL,
          start_date date NOT NULL,
          end_date date,
          remarks text,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created employee_work_history table');
    } else {
      console.log('  ✓ employee_work_history table already exists');
    }

    // 4. profile_change_status enum + profile_change_requests table
    const statusEnumRes = await pool.query(`SELECT 1 FROM pg_type WHERE typname = 'profile_change_status'`);
    if (statusEnumRes.rows.length === 0) {
      await pool.query(`
        CREATE TYPE profile_change_status AS ENUM (
          'pending_approval','approved','rejected','returned_for_modification','cancelled'
        )
      `);
      console.log('  ✓ Created profile_change_status enum');
    } else {
      console.log('  ✓ profile_change_status enum already exists');
    }

    const pcrTableRes = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'profile_change_requests'
    `);
    if (pcrTableRes.rows.length === 0) {
      await pool.query(`
        CREATE TABLE profile_change_requests (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          submitted_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          status profile_change_status DEFAULT 'pending_approval',
          changes json NOT NULL,
          comments text,
          reviewer_id integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          reviewer_comments text,
          decided_at timestamp,
          previous_request_id integer,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created profile_change_requests table');
    } else {
      console.log('  ✓ profile_change_requests table already exists');
    }

    // 5. notifications table
    const notificationsTableRes = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'notifications'
    `);
    if (notificationsTableRes.rows.length === 0) {
      await pool.query(`
        CREATE TABLE notifications (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          type varchar(100) NOT NULL,
          title varchar(255) NOT NULL,
          message text NOT NULL,
          payload json,
          link varchar(500),
          is_read boolean DEFAULT false,
          read_at timestamp,
          created_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created notifications table');
    } else {
      console.log('  ✓ notifications table already exists');
    }

    // 6. attachments table
    const attachmentsTableRes = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'attachments'
    `);
    if (attachmentsTableRes.rows.length === 0) {
      await pool.query(`
        CREATE TABLE attachments (
          id serial PRIMARY KEY,
          entity_type varchar(100) NOT NULL,
          entity_id integer NOT NULL,
          file_url varchar(500) NOT NULL,
          file_name varchar(255) NOT NULL,
          mime_type varchar(150),
          file_size integer,
          uploaded_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created attachments table');
    } else {
      console.log('  ✓ attachments table already exists');
    }

    console.log('✅ Profile Change Workflow tables/columns are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding Profile Change Workflow tables:', error);
    process.exit(1);
  }
}

addProfileChangeWorkflowTables();
