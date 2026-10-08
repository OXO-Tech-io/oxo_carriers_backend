import pool from '../config/database';

// Idempotent, additive-only migration script - mirrors the addHrModulesTables.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
// Adds event_participants.will_participate: the stated intention to attend,
// tracked separately from the existing `participated` (actual outcome) column.
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return res.rows.length > 0;
}

async function addEventParticipationIntent() {
  try {
    console.log('🔧 Adding event_participants.will_participate...');

    if (!(await columnExists('event_participants', 'will_participate'))) {
      await pool.query(`ALTER TABLE event_participants ADD COLUMN will_participate boolean`);
      console.log('  ✓ Added event_participants.will_participate');
    } else {
      console.log('  ✓ event_participants.will_participate already exists');
    }

    console.log('✅ Event participation intent column is up to date');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding event participation intent column:', error);
    process.exit(1);
  }
}

addEventParticipationIntent();
