import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addGroupsTables.ts pattern (see that
// file for why this doesn't go through `drizzle-kit generate`; same reason as 0004-0010: the
// tracked drizzle-kit snapshot in drizzle/meta/ has been out of sync with this repo's actual
// schema since migration 0003). The equivalent SQL is also kept at
// drizzle/0011_add_form_builder.sql for history.
//
// This script only adds new tables/columns - it never drops or renames the legacy
// form_fields/form_field_type table/enum or form_response_answers.field_id column. Run
// src/scripts/migrateFormFieldsToQuestions.ts afterwards to copy the legacy data across; dropping
// the legacy structures is a deliberate, separate manual step (see the bottom of the SQL file).
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

async function enumExists(typeName: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [typeName]);
  return res.rows.length > 0;
}

async function enumValueExists(typeName: string, value: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = $1 AND e.enumlabel = $2`,
    [typeName, value]
  );
  return res.rows.length > 0;
}

async function indexExists(indexName: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [indexName]);
  return res.rows.length > 0;
}

async function addFormBuilderTables() {
  try {
    console.log('🔧 Adding form builder tables (sections, questions, options, logic rules, settings, theme)...');

    // Determine whether tbl_forms or forms is the base table name
    const mainFormTable = (await tableExists('tbl_forms')) ? 'tbl_forms' : 'forms';

    // ── forms: new status values + denormalized response tracking ──────────
    for (const value of ['closed', 'archived']) {
      if (!(await enumValueExists('form_status', value))) {
        await pool.query(`ALTER TYPE form_status ADD VALUE '${value}'`);
        console.log(`  ✓ Added '${value}' to form_status enum`);
      } else {
        console.log(`  ✓ form_status enum already has '${value}'`);
      }
    }
    if (!(await columnExists(mainFormTable, 'published_at'))) {
      await pool.query(`ALTER TABLE ${mainFormTable} ADD COLUMN published_at timestamp`);
      console.log(`  ✓ Added ${mainFormTable}.published_at`);
    }
    if (!(await columnExists(mainFormTable, 'archived_at'))) {
      await pool.query(`ALTER TABLE ${mainFormTable} ADD COLUMN archived_at timestamp`);
      console.log(`  ✓ Added ${mainFormTable}.archived_at`);
    }
    if (!(await columnExists(mainFormTable, 'response_count'))) {
      await pool.query(`ALTER TABLE ${mainFormTable} ADD COLUMN response_count integer NOT NULL DEFAULT 0`);
      console.log(`  ✓ Added ${mainFormTable}.response_count`);
    }
    if (!(await columnExists(mainFormTable, 'last_response_at'))) {
      await pool.query(`ALTER TABLE ${mainFormTable} ADD COLUMN last_response_at timestamp`);
      console.log(`  ✓ Added ${mainFormTable}.last_response_at`);
    }

    // ── tbl_form_sections ────────────────────────────────────────────────────
    const sectionsTable = (await tableExists('tbl_form_sections')) ? 'tbl_form_sections' : 'form_sections';
    if (!(await tableExists(sectionsTable))) {
      await pool.query(`
        CREATE TABLE ${sectionsTable} (
          id serial PRIMARY KEY,
          form_id integer NOT NULL REFERENCES ${mainFormTable}(id) ON DELETE CASCADE,
          title varchar(255) NOT NULL DEFAULT '',
          description text,
          order_index integer NOT NULL DEFAULT 0
        )
      `);
      console.log(`  ✓ Created ${sectionsTable} table`);
    } else {
      console.log(`  ✓ ${sectionsTable} table already exists`);
    }

    // ── tbl_form_questions (+ form_question_type enum) ──────────────────────
    if (!(await enumExists('form_question_type'))) {
      await pool.query(`
        CREATE TYPE form_question_type AS ENUM (
          'short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown', 'file_upload',
          'linear_scale', 'multiple_choice_grid', 'checkbox_grid', 'rating', 'date', 'time',
          'datetime', 'yes_no', 'email', 'number', 'url', 'section_header', 'rich_text'
        )
      `);
      console.log('  ✓ Created form_question_type enum');
    } else {
      console.log('  ✓ form_question_type enum already exists');
    }
    const questionsTable = (await tableExists('tbl_form_questions')) ? 'tbl_form_questions' : 'form_questions';
    if (!(await tableExists(questionsTable))) {
      await pool.query(`
        CREATE TABLE ${questionsTable} (
          id serial PRIMARY KEY,
          form_id integer NOT NULL REFERENCES ${mainFormTable}(id) ON DELETE CASCADE,
          section_id integer REFERENCES ${sectionsTable}(id) ON DELETE SET NULL,
          type form_question_type NOT NULL,
          title varchar(255) NOT NULL DEFAULT '',
          description text,
          help_text text,
          placeholder varchar(255),
          required boolean NOT NULL DEFAULT false,
          order_index integer NOT NULL DEFAULT 0,
          config jsonb NOT NULL DEFAULT '{}',
          default_value jsonb
        )
      `);
      console.log(`  ✓ Created ${questionsTable} table`);
    } else {
      console.log(`  ✓ ${questionsTable} table already exists`);
    }

    // ── tbl_form_question_options ────────────────────────────────────────────
    const optionsTable = (await tableExists('tbl_form_question_options')) ? 'tbl_form_question_options' : 'form_question_options';
    if (!(await tableExists(optionsTable))) {
      await pool.query(`
        CREATE TABLE ${optionsTable} (
          id serial PRIMARY KEY,
          question_id integer NOT NULL REFERENCES ${questionsTable}(id) ON DELETE CASCADE,
          label varchar(255) NOT NULL,
          value varchar(255) NOT NULL,
          order_index integer NOT NULL DEFAULT 0,
          is_other boolean NOT NULL DEFAULT false
        )
      `);
      console.log(`  ✓ Created ${optionsTable} table`);
    } else {
      console.log(`  ✓ ${optionsTable} table already exists`);
    }

    // ── tbl_form_logic_rules (+ its 3 enums) ─────────────────────────────────
    if (!(await enumExists('form_logic_comparator'))) {
      await pool.query(`
        CREATE TYPE form_logic_comparator AS ENUM (
          'equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'
        )
      `);
      console.log('  ✓ Created form_logic_comparator enum');
    } else {
      console.log('  ✓ form_logic_comparator enum already exists');
    }
    if (!(await enumExists('form_logic_action'))) {
      await pool.query(`CREATE TYPE form_logic_action AS ENUM ('show', 'hide')`);
      console.log('  ✓ Created form_logic_action enum');
    } else {
      console.log('  ✓ form_logic_action enum already exists');
    }
    if (!(await enumExists('form_logic_combinator'))) {
      await pool.query(`CREATE TYPE form_logic_combinator AS ENUM ('all', 'any')`);
      console.log('  ✓ Created form_logic_combinator enum');
    } else {
      console.log('  ✓ form_logic_combinator enum already exists');
    }
    const logicRulesTable = (await tableExists('tbl_form_logic_rules')) ? 'tbl_form_logic_rules' : 'form_logic_rules';
    if (!(await tableExists(logicRulesTable))) {
      await pool.query(`
        CREATE TABLE ${logicRulesTable} (
          id serial PRIMARY KEY,
          form_id integer NOT NULL REFERENCES ${mainFormTable}(id) ON DELETE CASCADE,
          target_question_id integer NOT NULL REFERENCES ${questionsTable}(id) ON DELETE CASCADE,
          source_question_id integer NOT NULL REFERENCES ${questionsTable}(id) ON DELETE CASCADE,
          comparator form_logic_comparator NOT NULL,
          comparison_value jsonb,
          action form_logic_action NOT NULL DEFAULT 'show',
          combinator form_logic_combinator NOT NULL DEFAULT 'all',
          order_index integer NOT NULL DEFAULT 0
        )
      `);
      console.log(`  ✓ Created ${logicRulesTable} table`);
    } else {
      console.log(`  ✓ ${logicRulesTable} table already exists`);
    }

    // ── tbl_form_settings ─────────────────────────────────────────────────────
    const settingsTable = (await tableExists('tbl_form_settings')) ? 'tbl_form_settings' : 'form_settings';
    if (!(await tableExists(settingsTable))) {
      await pool.query(`
        CREATE TABLE ${settingsTable} (
          id serial PRIMARY KEY,
          form_id integer NOT NULL UNIQUE REFERENCES ${mainFormTable}(id) ON DELETE CASCADE,
          thank_you_message text,
          accept_responses boolean NOT NULL DEFAULT true,
          close_at timestamp,
          response_limit integer,
          allow_edit_after_submit boolean NOT NULL DEFAULT false,
          notify_owner_on_response boolean NOT NULL DEFAULT false,
          notify_respondent boolean NOT NULL DEFAULT false,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log(`  ✓ Created ${settingsTable} table`);
    } else {
      console.log(`  ✓ ${settingsTable} table already exists`);
    }

    // ── tbl_form_theme ────────────────────────────────────────────────────────
    const themeTable = (await tableExists('tbl_form_theme')) ? 'tbl_form_theme' : 'form_theme';
    if (!(await tableExists(themeTable))) {
      await pool.query(`
        CREATE TABLE ${themeTable} (
          id serial PRIMARY KEY,
          form_id integer NOT NULL UNIQUE REFERENCES ${mainFormTable}(id) ON DELETE CASCADE,
          primary_color varchar(32) NOT NULL DEFAULT '#4f46e5',
          header_image_url varchar(500),
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        )
      `);
      console.log(`  ✓ Created ${themeTable} table`);
    } else {
      console.log(`  ✓ ${themeTable} table already exists`);
    }

    // ── tbl_form_responses: draft/submit lifecycle + one-response-per-user ─────
    if (!(await enumExists('form_response_status'))) {
      await pool.query(`CREATE TYPE form_response_status AS ENUM ('in_progress', 'submitted')`);
      console.log('  ✓ Created form_response_status enum');
    } else {
      console.log('  ✓ form_response_status enum already exists');
    }
    const responsesTable = (await tableExists('tbl_form_responses')) ? 'tbl_form_responses' : 'form_responses';
    if (!(await columnExists(responsesTable, 'status'))) {
      await pool.query(`ALTER TABLE ${responsesTable} ADD COLUMN status form_response_status NOT NULL DEFAULT 'in_progress'`);
      console.log(`  ✓ Added ${responsesTable}.status`);
    }
    if (!(await columnExists(responsesTable, 'started_at'))) {
      await pool.query(`ALTER TABLE ${responsesTable} ADD COLUMN started_at timestamp DEFAULT now()`);
      console.log(`  ✓ Added ${responsesTable}.started_at`);
    }
    if (!(await columnExists(responsesTable, 'completion_ms'))) {
      await pool.query(`ALTER TABLE ${responsesTable} ADD COLUMN completion_ms integer`);
      console.log(`  ✓ Added ${responsesTable}.completion_ms`);
    }
    if (await columnExists(responsesTable, 'user_id') && !(await indexExists('form_responses_form_id_user_id_idx'))) {
      const dupes = await pool.query(
        `SELECT form_id, user_id FROM ${responsesTable} GROUP BY form_id, user_id HAVING COUNT(*) > 1 LIMIT 1`
      );
      if (dupes.rows.length) {
        console.warn(
          '  ⚠ Skipped form_responses_form_id_user_id_idx - duplicate (form_id, user_id) rows exist. Resolve them manually first.'
        );
      } else {
        await pool.query(`CREATE UNIQUE INDEX form_responses_form_id_user_id_idx ON ${responsesTable} (form_id, user_id)`);
        console.log('  ✓ Created form_responses_form_id_user_id_idx');
      }
    }

    // ── tbl_form_response_answers: structured value + question_id (nullable until backfilled) ──
    const answersTable = (await tableExists('tbl_form_response_answers')) ? 'tbl_form_response_answers' : 'form_response_answers';
    if (!(await columnExists(answersTable, 'question_id'))) {
      await pool.query(`ALTER TABLE ${answersTable} ADD COLUMN question_id integer REFERENCES ${questionsTable}(id) ON DELETE CASCADE`);
      console.log(`  ✓ Added ${answersTable}.question_id (nullable - backfilled by migrateFormFieldsToQuestions.ts)`);
    }
    if (!(await columnExists(answersTable, 'value'))) {
      await pool.query(`ALTER TABLE ${answersTable} ADD COLUMN value jsonb DEFAULT '{}'`);
      console.log(`  ✓ Added ${answersTable}.value`);
    }
    if (!(await indexExists('form_response_answers_response_id_question_id_idx'))) {
      await pool.query(
        `CREATE UNIQUE INDEX form_response_answers_response_id_question_id_idx ON ${answersTable} (response_id, question_id)`
      );
      console.log('  ✓ Created form_response_answers_response_id_question_id_idx');
    }

    console.log('✅ Form builder tables are up to date');
    console.log('   Next: run `npm run db:migrate-form-fields` to copy form_fields data across.');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding form builder tables:', error);
    process.exit(1);
  }
}

addFormBuilderTables();
