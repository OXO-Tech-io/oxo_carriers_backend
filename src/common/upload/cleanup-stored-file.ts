import fs from 'fs/promises';
import path from 'path';
import { FileBlobModel } from '../models/FileBlob';
import { logger } from '../../lib/logger';
import { UPLOADS_ROOT } from '../constants/fileCategories';
import { isSecureBucketConfigured, deletePrivateObject } from '../../lib/storage/gcsStorage';

/**
 * Removes every durable copy of a file previously stored via multer disk
 * storage + FileBlobModel.persist (see FileBlob.ts) and/or the GCS upload
 * added alongside it: the on-disk copy under uploads/ (often already gone -
 * Cloud Run's disk is ephemeral), its Postgres fallback row in
 * tbl_file_blobs, and its GCS object (when a bucket is configured) - all
 * keyed by the filename/category embedded in `fileUrl`
 * (/uploads/documents/<filename> or /uploads/others/<filename>). Callers must
 * only invoke this once nothing references the file any more - this function
 * itself has no way to check that. Best-effort: always resolves, every
 * failure is only logged.
 */
export async function cleanupStoredFile(fileUrl: string): Promise<void> {
  const filename = path.basename(fileUrl);
  const category = path.basename(path.dirname(fileUrl));
  await Promise.all([
    fs.unlink(path.join(UPLOADS_ROOT, category, filename)).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        logger.error({ err, filename }, 'Failed to delete on-disk upload');
      }
    }),
    FileBlobModel.deleteByFilename(filename).catch((err: unknown) =>
      logger.error({ err, filename }, 'Failed to delete durable file blob'),
    ),
    isSecureBucketConfigured()
      ? deletePrivateObject(fileUrl.replace(/^\/+/, '')).catch((err: unknown) =>
          logger.error({ err, filename }, 'Failed to delete durable file blob from cloud storage'),
        )
      : Promise.resolve(),
  ]);
}
