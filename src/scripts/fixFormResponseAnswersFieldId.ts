import pool from '../config/database';

// The deferred cleanup step documented at the bottom of drizzle/0011_add_form_builder.sql
// (and src/scripts/migrateFormFieldsToQuestions.ts) was never run in this environment: the legacy
// `form_response_answers.field_id` column is still NOT NULL with no default, but every current
// insert path (FormResponseModel.upsertAnswer, via the Drizzle schema which doesn't know this
// column exists) only ever supplies `question_id` - so every response submission fails with
// "null value in column \"field_id\" violates not-null constraint". This script only loosens that
// constraint (and tightens `question_id` to NOT NULL, matching the Drizzle schema's declared
// intent) - it does not touch the legacy form_fields table/form_field_type enum or drop the
// field_id column itself; that fuller cleanup is a separate, deliberate step (see that SQL file).
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows.length > 0;
}

async function columnIsNullable(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows[0]?.is_nullable === 'YES';
}

async function fixFormResponseAnswersFieldId() {
  try {
    console.log('🔧 Fixing form_response_answers.field_id / question_id nullability...');

    if ((await columnExists('form_response_answers', 'field_id')) && !(await columnIsNullable('form_response_answers', 'field_id'))) {
      await pool.query(`ALTER TABLE form_response_answers ALTER COLUMN field_id DROP NOT NULL`);
      console.log('  ✓ Dropped NOT NULL on form_response_answers.field_id');
    } else {
      console.log('  ✓ form_response_answers.field_id already nullable (or column absent)');
    }

    if (await columnIsNullable('form_response_answers', 'question_id')) {
      const { rows } = await pool.query(`SELECT count(*)::int AS c FROM form_response_answers WHERE question_id IS NULL`);
      if (rows[0].c === 0) {
        await pool.query(`ALTER TABLE form_response_answers ALTER COLUMN question_id SET NOT NULL`);
        console.log('  ✓ Set form_response_answers.question_id NOT NULL (matches the Drizzle schema)');
      } else {
        console.log(`  ⚠ Skipped question_id NOT NULL - ${rows[0].c} row(s) still have a null question_id`);
      }
    } else {
      console.log('  ✓ form_response_answers.question_id already NOT NULL');
    }

    console.log('✅ form_response_answers is fixed - response submission is unblocked');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error fixing form_response_answers:', error);
    process.exit(1);
  }
}

fixFormResponseAnswersFieldId();
