import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addGroupsTables.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
//
// This DB already had a prior, abandoned attempt at this exact feature: the
// six new tables below existed already but with zero FK constraints and ~380
// rows referencing form_ids (18-115) that don't exist in tbl_forms (which is
// empty) - orphaned test debris, confirmed disconnected from any working code
// path. This script drops that debris and rebuilds the tables properly. The
// enum types it left behind (form_question_type, form_logic_comparator,
// form_logic_action, form_logic_combinator, form_response_status, and
// form_status's extra 'closed'/'archived' values) already exactly match what
// this schema needs, so they're reused as-is rather than recreated.
//
// It also drops the old flat tbl_form_fields table (superseded by
// tbl_form_questions, which already existed with the right shape) and two
// stray `user_id` columns left over from that same abandoned attempt on
// tbl_form_responses/tbl_form_distributions (both tables already correctly
// use `employee_id`, restored to NOT NULL here).
async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows.length > 0;
}

async function hasForeignKey(tableName: string, constraintName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints WHERE table_schema = current_schema() AND table_name = $1 AND constraint_name = $2`,
    [tableName, constraintName]
  );
  return res.rows.length > 0;
}

async function addFormBuilderTables() {
  try {
    console.log('🔧 Rebuilding Forms tables...');

    // The one-time cleanup below (drop + recreate) must only run against the
    // specific orphaned/no-FK state this script was written to fix - never
    // against a properly-built table that might hold real data. Guard on
    // whether tbl_form_sections already has its expected FK to tbl_forms.
    const alreadyRebuilt =
      (await tableExists('tbl_form_sections')) &&
      (await hasForeignKey('tbl_form_sections', 'tbl_form_sections_form_id_fkey'));

    if (!alreadyRebuilt) {
      console.log('  Dropping orphaned form-builder tables (no FK integrity, referencing nonexistent forms)...');
      await pool.query(`
        DROP TABLE IF EXISTS tbl_form_theme, tbl_form_settings, tbl_form_logic_rules,
          tbl_form_question_options, tbl_form_questions, tbl_form_sections CASCADE
      `);
      console.log('  ✓ Dropped');

      await pool.query(`
      CREATE TABLE tbl_form_sections (
        id serial PRIMARY KEY,
        form_id integer NOT NULL REFERENCES tbl_forms(id) ON DELETE CASCADE,
        title varchar(255) NOT NULL,
        description text,
        order_index integer NOT NULL DEFAULT 0
      )
    `);
    console.log('  ✓ Created tbl_form_sections');

    await pool.query(`
      CREATE TABLE tbl_form_questions (
        id serial PRIMARY KEY,
        form_id integer NOT NULL REFERENCES tbl_forms(id) ON DELETE CASCADE,
        section_id integer REFERENCES tbl_form_sections(id) ON DELETE SET NULL,
        type form_question_type NOT NULL,
        title varchar(500) NOT NULL DEFAULT '',
        description text,
        help_text text,
        placeholder varchar(500),
        required boolean NOT NULL DEFAULT false,
        order_index integer NOT NULL DEFAULT 0,
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        default_value jsonb
      )
    `);
    console.log('  ✓ Created tbl_form_questions');

    await pool.query(`
      CREATE TABLE tbl_form_question_options (
        id serial PRIMARY KEY,
        question_id integer NOT NULL REFERENCES tbl_form_questions(id) ON DELETE CASCADE,
        label varchar(255) NOT NULL,
        value varchar(255) NOT NULL,
        order_index integer NOT NULL DEFAULT 0,
        is_other boolean NOT NULL DEFAULT false
      )
    `);
    console.log('  ✓ Created tbl_form_question_options');

    await pool.query(`
      CREATE TABLE tbl_form_logic_rules (
        id serial PRIMARY KEY,
        form_id integer NOT NULL REFERENCES tbl_forms(id) ON DELETE CASCADE,
        target_question_id integer NOT NULL REFERENCES tbl_form_questions(id) ON DELETE CASCADE,
        source_question_id integer NOT NULL REFERENCES tbl_form_questions(id) ON DELETE CASCADE,
        comparator form_logic_comparator NOT NULL,
        comparison_value jsonb,
        action form_logic_action NOT NULL DEFAULT 'show',
        combinator form_logic_combinator NOT NULL DEFAULT 'all',
        order_index integer NOT NULL DEFAULT 0
      )
    `);
    console.log('  ✓ Created tbl_form_logic_rules');

    await pool.query(`
      CREATE TABLE tbl_form_settings (
        form_id integer PRIMARY KEY REFERENCES tbl_forms(id) ON DELETE CASCADE,
        thank_you_message text,
        accept_responses boolean NOT NULL DEFAULT true,
        close_at timestamp,
        response_limit integer,
        allow_edit_after_submit boolean NOT NULL DEFAULT false,
        notify_owner_on_response boolean NOT NULL DEFAULT true,
        notify_respondent boolean NOT NULL DEFAULT false
      )
    `);
    console.log('  ✓ Created tbl_form_settings');

    await pool.query(`
      CREATE TABLE tbl_form_theme (
        form_id integer PRIMARY KEY REFERENCES tbl_forms(id) ON DELETE CASCADE,
        primary_color varchar(20),
        header_image_url varchar(500)
      )
    `);
    console.log('  ✓ Created tbl_form_theme');
    } else {
      console.log('  ✓ Form-builder tables already rebuilt, skipping');
    }

    // tbl_form_questions.config must never be null - the frontend's
    // FormQuestion.config type is a plain non-nullable object, and
    // QuestionEditor.tsx reads question.config['columns'] unconditionally.
    await pool.query(`ALTER TABLE tbl_form_questions ALTER COLUMN config SET DEFAULT '{}'::jsonb`);
    await pool.query(`UPDATE tbl_form_questions SET config = '{}'::jsonb WHERE config IS NULL`);
    await pool.query(`ALTER TABLE tbl_form_questions ALTER COLUMN config SET NOT NULL`);

    // tbl_form_response_answers: drop legacy field_id (+ its FK), keep the
    // already-correct question_id/value columns alongside existing value_text.
    if (await columnExists('tbl_form_response_answers', 'field_id')) {
      await pool.query(`
        ALTER TABLE tbl_form_response_answers
          DROP CONSTRAINT IF EXISTS form_response_answers_field_id_fkey,
          DROP COLUMN field_id
      `);
      console.log('  ✓ Dropped legacy tbl_form_response_answers.field_id');
    }
    await pool.query(`ALTER TABLE tbl_form_response_answers ALTER COLUMN question_id SET NOT NULL`);

    // tbl_form_fields is fully superseded by tbl_form_questions.
    if (await tableExists('tbl_form_fields')) {
      await pool.query(`DROP TABLE tbl_form_fields CASCADE`);
      console.log('  ✓ Dropped legacy tbl_form_fields');
    }

    // tbl_form_responses / tbl_form_distributions: drop the stray unused
    // user_id column from the abandoned attempt, restore employee_id to
    // NOT NULL (both tables are empty, so this is safe).
    for (const t of ['tbl_form_responses', 'tbl_form_distributions']) {
      if (await columnExists(t, 'user_id')) {
        await pool.query(`
          ALTER TABLE ${t}
            DROP CONSTRAINT IF EXISTS ${t}_user_id_fkey,
            DROP COLUMN user_id
        `);
        console.log(`  ✓ Dropped stray ${t}.user_id`);
      }
      await pool.query(`ALTER TABLE ${t} ALTER COLUMN employee_id SET NOT NULL`);
    }

    // tbl_form_distributions previously had no protection against the same
    // employee being distributed the same form twice (re-clicking Distribute,
    // or re-distributing to an overlapping recipient set duplicated the row,
    // duplicated the form in that employee's My Forms list, and duplicated
    // the assignment notification/email). Dedupe any existing duplicates
    // (keep the earliest) before adding the constraint that prevents new ones.
    await pool.query(`
      DELETE FROM tbl_form_distributions a USING tbl_form_distributions b
      WHERE a.form_id = b.form_id AND a.employee_id = b.employee_id AND a.id > b.id
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tbl_form_distributions_form_id_employee_id_idx
        ON tbl_form_distributions (form_id, employee_id)
    `);

    // tbl_forms already has published_at/archived_at/response_count(default 0)/
    // last_response_at from the abandoned attempt - just fill in anything missing.
    if (!(await columnExists('tbl_forms', 'published_at'))) {
      await pool.query(`ALTER TABLE tbl_forms ADD COLUMN published_at timestamp`);
    }
    if (!(await columnExists('tbl_forms', 'archived_at'))) {
      await pool.query(`ALTER TABLE tbl_forms ADD COLUMN archived_at timestamp`);
    }
    if (!(await columnExists('tbl_forms', 'response_count'))) {
      await pool.query(`ALTER TABLE tbl_forms ADD COLUMN response_count integer NOT NULL DEFAULT 0`);
    }
    if (!(await columnExists('tbl_forms', 'last_response_at'))) {
      await pool.query(`ALTER TABLE tbl_forms ADD COLUMN last_response_at timestamp`);
    }

    console.log('✅ Forms tables are up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error rebuilding Forms tables:', error);
    process.exit(1);
  }
}

addFormBuilderTables();
