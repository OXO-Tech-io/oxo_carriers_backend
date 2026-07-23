import pool from '../config/database';

// One-off data migration (run AFTER src/scripts/addFormBuilderTables.ts / drizzle/0011_add_form_
// builder.sql have been applied): copies each legacy `form_fields` row into `form_questions` (+ its
// `options[]` into `form_question_options`), backfills `form_response_answers.question_id` from the
// old `field_id`, and backfills `forms.response_count`/`last_response_at` from `form_responses`.
//
// Field type mapping (per the approved plan): text -> short_answer, radio -> multiple_choice,
// select -> dropdown, file -> file_upload.
//
// Idempotent: a form already having form_questions rows is skipped entirely (assumed already
// migrated); the response_count/status backfills use guarded WHERE clauses safe to re-run.
//
// Uses raw pool queries (matching fixLeaveBalances.ts's convention for data-migration scripts,
// as opposed to the Drizzle-typed model classes) since the legacy `form_fields` table/columns are
// intentionally no longer part of src/db/schema/forms.ts (replaced in place by form_questions).
//
// IMPORTANT: this script performs real writes. Do not run it against a shared/production database
// without first confirming with the team - see the plan's "Migration" section.

const FIELD_TYPE_MAP: Record<string, string> = {
  text: 'short_answer',
  radio: 'multiple_choice',
  select: 'dropdown',
  file: 'file_upload',
};

async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function migrateFormFieldsToQuestions() {
  try {
    if (!(await tableExists('form_fields'))) {
      console.log('  ✓ No legacy form_fields table found - nothing to migrate.');
      process.exit(0);
      return;
    }

    console.log('🔧 Migrating form_fields -> form_questions/form_question_options...');

    const alreadyMigratedRes = await pool.query(`SELECT DISTINCT form_id FROM form_questions`);
    const alreadyMigratedFormIds = new Set((alreadyMigratedRes.rows as { form_id: number }[]).map((r) => r.form_id));

    const fieldsRes = await pool.query(
      `SELECT id, form_id, label, field_type, options, required, order_index
       FROM form_fields
       ORDER BY form_id, order_index, id`
    );
    const fields = fieldsRes.rows as {
      id: number;
      form_id: number;
      label: string;
      field_type: string;
      options: string[] | null;
      required: boolean;
      order_index: number;
    }[];

    const fieldIdToQuestionId = new Map<number, number>();
    let questionsCreated = 0;
    let optionsCreated = 0;
    let formsSkipped = 0;

    for (const field of fields) {
      if (alreadyMigratedFormIds.has(field.form_id)) {
        formsSkipped++;
        continue;
      }
      const type = FIELD_TYPE_MAP[field.field_type] ?? 'short_answer';
      const questionRes = await pool.query(
        `INSERT INTO form_questions (form_id, section_id, type, title, description, help_text, placeholder, required, order_index, config, default_value)
         VALUES ($1, NULL, $2, $3, NULL, NULL, NULL, $4, $5, '{}', NULL)
         RETURNING id`,
        [field.form_id, type, field.label, field.required, field.order_index]
      );
      const questionId = questionRes.rows[0].id as number;
      fieldIdToQuestionId.set(field.id, questionId);
      questionsCreated++;

      const options = Array.isArray(field.options) ? field.options : [];
      for (const [index, optionLabel] of options.entries()) {
        await pool.query(
          `INSERT INTO form_question_options (question_id, label, value, order_index, is_other)
           VALUES ($1, $2, $3, $4, false)`,
          [questionId, optionLabel, optionLabel, index]
        );
        optionsCreated++;
      }
    }

    console.log(`  ✓ Created ${questionsCreated} form_questions (${optionsCreated} options) - skipped ${formsSkipped} already-migrated field(s)`);

    let answersBackfilled = 0;
    for (const [fieldId, questionId] of fieldIdToQuestionId.entries()) {
      const res = await pool.query(
        `UPDATE form_response_answers SET question_id = $1 WHERE field_id = $2 AND question_id IS NULL`,
        [questionId, fieldId]
      );
      answersBackfilled += res.rowCount ?? 0;
    }
    console.log(`  ✓ Backfilled question_id on ${answersBackfilled} form_response_answers row(s)`);

    // Pre-migration `form_responses` rows always represent a completed submission (the old app
    // only ever wrote a row on full submit, no draft concept) - `submitted_at` was always set at
    // creation time, which is what distinguishes them from genuinely new in-progress drafts
    // created after this migration (those have submitted_at = NULL until finalized).
    const statusRes = await pool.query(
      `UPDATE form_responses SET status = 'submitted' WHERE status = 'in_progress' AND submitted_at IS NOT NULL`
    );
    console.log(`  ✓ Marked ${statusRes.rowCount ?? 0} legacy form_responses row(s) as submitted`);

    const backfillRes = await pool.query(`
      UPDATE forms f
      SET response_count = sub.cnt, last_response_at = sub.last
      FROM (
        SELECT form_id, COUNT(*) AS cnt, MAX(submitted_at) AS last
        FROM form_responses
        WHERE status = 'submitted'
        GROUP BY form_id
      ) sub
      WHERE f.id = sub.form_id
    `);
    console.log(`  ✓ Backfilled response_count/last_response_at on ${backfillRes.rowCount ?? 0} form(s)`);

    console.log('✅ form_fields -> form_questions migration complete');
    console.log(
      '   Legacy form_fields/form_field_type + form_response_answers.field_id were left in place - see drizzle/0011_add_form_builder.sql for the follow-up cleanup step.'
    );
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error migrating form_fields to form_questions:', error);
    process.exit(1);
  }
}

migrateFormFieldsToQuestions();
