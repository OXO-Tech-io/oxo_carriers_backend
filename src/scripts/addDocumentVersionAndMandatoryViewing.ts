import pool from '../config/database';
import { logger } from '../lib/logger';

// Idempotent, additive-only migration script - mirrors the addWorkLogDeadline.ts
// pattern (see that file for why this doesn't go through `drizzle-kit generate`).
//
// OCD-500: Document Vault documents had no concept of a version number or a
// "mandatory viewing" flag. Both are safe as NOT NULL with a DEFAULT since
// they backfill every existing row without a data migration: `version`
// defaults to '1.0' (every pre-existing document is treated as its first
// version), `is_mandatory_viewing` defaults to false (existing documents
// keep behaving exactly as before - nothing becomes mandatory retroactively).
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [tableName, columnName],
  );
  return res.rows.length > 0;
}

async function addDocumentVersionAndMandatoryViewing() {
  try {
    logger.info('Adding Document Vault version + mandatory viewing columns...');

    for (const [column, ddl] of [
      ['version', `ALTER TABLE tbl_documents ADD COLUMN version varchar(50) NOT NULL DEFAULT '1.0'`],
      [
        'is_mandatory_viewing',
        'ALTER TABLE tbl_documents ADD COLUMN is_mandatory_viewing boolean NOT NULL DEFAULT false',
      ],
    ] as const) {
      if (!(await columnExists('tbl_documents', column))) {
        await pool.query(ddl);
        logger.info(`Added tbl_documents.${column}`);
      } else {
        logger.info(`tbl_documents.${column} already exists`);
      }
    }

    logger.info('Document Vault version + mandatory viewing schema is up to date');
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, 'Error adding Document Vault version + mandatory viewing columns');
    process.exit(1);
  }
}

addDocumentVersionAndMandatoryViewing();
