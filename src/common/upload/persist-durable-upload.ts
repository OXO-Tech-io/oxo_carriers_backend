import fs from 'fs';
import { FileBlobModel } from '../models/FileBlob';
import { isSecureBucketConfigured, uploadPrivateObject } from '../../lib/storage/gcsStorage';
import { logger } from '../../lib/logger';
import type { FileCategory } from '../constants/fileCategories';

/**
 * Best-effort durable copy of a file multer just wrote to the local uploads/
 * directory. Cloud Run's disk is ephemeral (scale to zero, a redeploy, or a
 * request landing on another instance), so a path stored as
 * /uploads/<category>/<filename> 404s later unless a copy also lives somewhere
 * that survives - see createDurableUploadFallback (main.ts), which serves the
 * copy back once the disk file is gone. Same Postgres + GCS pair that
 * AttachmentModel, medical insurance and notices already write (OCD-493 /
 * OCD-569); this is the shared form for modules that only store a URL.
 *
 * Awaited by callers rather than fired-and-forgotten: Cloud Run may throttle
 * CPU once the response is sent, which could cut an un-awaited upload short.
 * Never throws - a failed copy is logged and must not fail the request that
 * already succeeded.
 */
export async function persistDurableUpload(file: Express.Multer.File, category: FileCategory): Promise<void> {
  await Promise.all([
    FileBlobModel.persist(file).catch((err: unknown) =>
      logger.error({ err, filename: file.filename }, 'Failed to persist uploaded file to the database'),
    ),
    isSecureBucketConfigured()
      ? Promise.resolve()
          .then(() => uploadPrivateObject(`uploads/${category}/${file.filename}`, fs.readFileSync(file.path), file.mimetype))
          .catch((err: unknown) =>
            logger.error({ err, filename: file.filename }, 'Failed to persist uploaded file to cloud storage'),
          )
      : Promise.resolve(),
  ]);
}
