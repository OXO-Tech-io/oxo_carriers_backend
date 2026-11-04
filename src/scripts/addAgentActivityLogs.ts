import { readFileSync } from 'fs';
import { join } from 'path';
import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent runner for the agent-activity migrations, in order - same pattern as
// addAttendanceTracking.ts (each .sql file is itself idempotent).
const MIGRATIONS = ['0031_add_agent_activity_logs.sql', '0032_add_agent_activity_window_title.sql', '0033_add_agent_screenshots.sql', '0034_agent_screenshots_gcs.sql', '0035_agent_device_tokens.sql', '0036_rename_agent_screenshots_to_employee_screenshots.sql', '0037_rename_agent_device_tokens_to_employee_device_tokens.sql'];

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
