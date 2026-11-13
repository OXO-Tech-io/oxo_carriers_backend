import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, additive-only migration - mirrors addCareerPathColumn.ts.
// Adds the LinkedIn connection/sync columns declared in employee.schema.ts.
const COLUMNS = [
  { column: 'linkedin_connected_at', ddl: 'timestamp' },
  { column: 'linkedin_sync_requested_at', ddl: 'timestamp' },
  { column: 'linkedin_latest_company', ddl: 'varchar(255)' },
  { column: 'linkedin_latest_title', ddl: 'varchar(255)' },
  { column: 'linkedin_latest_start_date', ddl: 'date' },
  { column: 'linkedin_synced_at', ddl: 'timestamp' },
  { column: 'linkedin_sync_error', ddl: 'varchar(255)' },
];

async function run() {
  try {
    for (const { column, ddl } of COLUMNS) {
      await pool.query(`ALTER TABLE tbl_employee ADD COLUMN IF NOT EXISTS ${column} ${ddl}`);
      logger.info({ column }, 'Ensured column');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error adding LinkedIn columns');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
