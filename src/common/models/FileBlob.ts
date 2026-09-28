import fs from 'fs';
import pool from '../../config/database';
import { logger } from '../../lib/logger';

/**
 * OCD-498 / OCD-569: same ephemeral-disk problem already diagnosed and fixed
 * once for medical insurance claims (see
 * MedicalInsuranceModel.persistDocumentBlob/getDocumentBlob, OCD-493) - Cloud
 * Run's local disk doesn't survive instance recycling (scale to zero, a
 * redeploy, or a request simply landing on a different instance), so a file
 * multer wrote to uploads/ can 404 later even though it was reachable on the
 * day it was uploaded. This generalizes that same durable-Postgres-copy
 * pattern so every other upload flow (document vault attachments, notice
 * images, communication attachments) gets it too, instead of re-solving it
 * per module. See main.ts for the read-side fallback.
 */
export class FileBlobModel {
  private static async ensureTable(): Promise<void> {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tbl_file_blobs (
          filename VARCHAR(255) PRIMARY KEY,
          mime_type VARCHAR(150) NOT NULL,
          data BYTEA NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
    } catch (error: any) {
      logger.warn({ err: error }, 'File blob table check/create warning');
    }
  }

  static async persist(file: { filename: string; mimetype: string; path: string }): Promise<void> {
    await this.ensureTable();
    const data = fs.readFileSync(file.path);
    await pool.query(
      `INSERT INTO tbl_file_blobs (filename, mime_type, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (filename) DO NOTHING`,
      [file.filename, file.mimetype, data]
    );
  }

  static async get(filename: string): Promise<{ mimeType: string; data: Buffer } | null> {
    await this.ensureTable();
    const result = await pool.query(`SELECT mime_type, data FROM tbl_file_blobs WHERE filename = $1`, [filename]);
    const row = (result.rows as any[])[0];
    if (!row) return null;
    return { mimeType: row.mime_type, data: row.data };
  }

  static async deleteByFilename(filename: string): Promise<void> {
    await this.ensureTable();
    await pool.query(`DELETE FROM tbl_file_blobs WHERE filename = $1`, [filename]);
  }
}
