import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the
// addProfileChangeWorkflowTables.ts pattern (see that file for why this
// doesn't go through `drizzle-kit generate`). The equivalent SQL is also
// kept at drizzle/0008_add_hr_modules.sql for history, consistent with how
// 0004-0007 were handled.
async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function enumExists(typeName: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [typeName]);
  return res.rows.length > 0;
}

async function addHrModulesTables() {
  try {
    console.log('🔧 Adding HR modules tables (Notes, Communications, Events, Forms, Work Logs)...');

    if (!(await tableExists('employee_notes'))) {
      await pool.query(`
        CREATE TABLE employee_notes (
          id serial PRIMARY KEY,
          employee_user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          author_user_id integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          content text NOT NULL,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created employee_notes table');
    } else {
      console.log('  ✓ employee_notes table already exists');
    }

    if (!(await tableExists('communications'))) {
      await pool.query(`
        CREATE TABLE communications (
          id serial PRIMARY KEY,
          title varchar(255) NOT NULL,
          body text NOT NULL,
          created_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created communications table');
    } else {
      console.log('  ✓ communications table already exists');
    }

    if (!(await tableExists('communication_recipients'))) {
      await pool.query(`
        CREATE TABLE communication_recipients (
          id serial PRIMARY KEY,
          communication_id integer NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          email_sent_at timestamp,
          responded_at timestamp,
          response_text text
        )
      `);
      console.log('  ✓ Created communication_recipients table');
    } else {
      console.log('  ✓ communication_recipients table already exists');
    }

    if (!(await tableExists('events'))) {
      await pool.query(`
        CREATE TABLE events (
          id serial PRIMARY KEY,
          name varchar(255) NOT NULL,
          description text,
          event_date timestamp NOT NULL,
          location varchar(255),
          created_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created events table');
    } else {
      console.log('  ✓ events table already exists');
    }

    if (!(await tableExists('event_participants'))) {
      await pool.query(`
        CREATE TABLE event_participants (
          id serial PRIMARY KEY,
          event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          participated boolean NOT NULL DEFAULT false,
          recorded_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          recorded_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created event_participants table');
    } else {
      console.log('  ✓ event_participants table already exists');
    }

    if (!(await enumExists('form_status'))) {
      await pool.query(`CREATE TYPE form_status AS ENUM ('draft', 'published')`);
      console.log('  ✓ Created form_status enum');
    } else {
      console.log('  ✓ form_status enum already exists');
    }

    if (!(await enumExists('form_field_type'))) {
      await pool.query(`CREATE TYPE form_field_type AS ENUM ('text', 'radio', 'select', 'file')`);
      console.log('  ✓ Created form_field_type enum');
    } else {
      console.log('  ✓ form_field_type enum already exists');
    }

    if (!(await tableExists('forms'))) {
      await pool.query(`
        CREATE TABLE forms (
          id serial PRIMARY KEY,
          title varchar(255) NOT NULL,
          description text,
          status form_status NOT NULL DEFAULT 'draft',
          created_by integer REFERENCES tbl_employee(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created forms table');
    } else {
      console.log('  ✓ forms table already exists');
    }

    if (!(await tableExists('form_fields'))) {
      await pool.query(`
        CREATE TABLE form_fields (
          id serial PRIMARY KEY,
          form_id integer NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
          label varchar(255) NOT NULL,
          field_type form_field_type NOT NULL,
          options json,
          required boolean NOT NULL DEFAULT false,
          order_index integer NOT NULL DEFAULT 0
        )
      `);
      console.log('  ✓ Created form_fields table');
    } else {
      console.log('  ✓ form_fields table already exists');
    }

    if (!(await tableExists('form_distributions'))) {
      await pool.query(`
        CREATE TABLE form_distributions (
          id serial PRIMARY KEY,
          form_id integer NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          distributed_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created form_distributions table');
    } else {
      console.log('  ✓ form_distributions table already exists');
    }

    if (!(await tableExists('form_responses'))) {
      await pool.query(`
        CREATE TABLE form_responses (
          id serial PRIMARY KEY,
          form_id integer NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          submitted_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created form_responses table');
    } else {
      console.log('  ✓ form_responses table already exists');
    }

    if (!(await tableExists('form_response_answers'))) {
      await pool.query(`
        CREATE TABLE form_response_answers (
          id serial PRIMARY KEY,
          response_id integer NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
          field_id integer NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
          value_text text
        )
      `);
      console.log('  ✓ Created form_response_answers table');
    } else {
      console.log('  ✓ form_response_answers table already exists');
    }

    if (!(await tableExists('work_logs'))) {
      await pool.query(`
        CREATE TABLE work_logs (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES tbl_employee(id) ON DELETE CASCADE,
          work_date date NOT NULL,
          task_description text NOT NULL,
          hours_spent numeric(5, 2) NOT NULL,
          remarks text,
          created_at timestamp DEFAULT now()
        )
      `);
      console.log('  ✓ Created work_logs table');
    } else {
      console.log('  ✓ work_logs table already exists');
    }

    console.log('✅ HR modules tables are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding HR modules tables:', error);
    process.exit(1);
  }
}

addHrModulesTables();
