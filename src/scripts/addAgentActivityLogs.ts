import { readFileSync } from 'fs';
import { join } from 'path';
import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent runner for the agent-activity migrations, in order - same pattern as
// addAttendanceTracking.ts (each .sql file is itself idempotent).
const MIGRATIONS = ['0031_add_agent_activity_logs.sql', '0032_add_agent_activity_window_title.sql'];

async function addAgentActivityLogs() {
  try {
    logger.info('Adding agent activity logs schema...');

    for (const file of MIGRATIONS) {
      await pool.query(readFileSync(join(__dirname, '..', '..', 'drizzle', file), 'utf8'));
    }

    logger.info('Agent activity logs schema is up to date');
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, 'Error adding agent activity logs schema');
    process.exit(1);
  }
}

addAgentActivityLogs();
