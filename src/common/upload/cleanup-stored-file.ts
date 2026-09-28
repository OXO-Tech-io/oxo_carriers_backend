import fs from 'fs/promises';
import path from 'path';
import { FileBlobModel } from '../models/FileBlob';
import { logger } from '../../lib/logger';

/**
 * Removes both durable copies of a file previously stored via multer disk
 * storage + FileBlobModel.persist (see FileBlob.ts): the on-disk copy under
 * uploads/ (often already gone - Cloud Run's disk is ephemeral) and its
 * Postgres fallback row in tbl_file_blobs, keyed by the filename embedded in
 * `fileUrl` (/uploads/documents/<filename> or /uploads/others/<filename>).
 * Callers must only invoke this once nothing references the file any more -
 * this function itself has no way to check that. Best-effort: always
 * resolves, every failure is only logged.
 */
export async function cleanupStoredFile(fileUrl: string): Promise<void> {
  const filename = path.basename(fileUrl);
  await Promise.all([
    fs.unlink(path.join(process.cwd(), fileUrl.replace(/^\/+/, ''))).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        logger.error({ err, filename }, 'Failed to delete on-disk upload');
      }
    }),
    FileBlobModel.deleteByFilename(filename).catch((err: unknown) =>
      logger.error({ err, filename }, 'Failed to delete durable file blob'),
    ),
  ]);
}
