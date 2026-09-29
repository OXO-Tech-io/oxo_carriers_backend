import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import { MedicalInsuranceModel } from '../../modules/medical-insurance/MedicalInsurance';
import { FileBlobModel } from '../models/FileBlob';
import { isSecureBucketConfigured, downloadPrivateObject } from '../../lib/storage/gcsStorage';
import { CONTENT_TYPES, type FileCategory } from '../constants/fileCategories';
import { logger } from '../../lib/logger';

/**
 * Serves the durable copy of an uploaded file when the on-disk static file is
 * missing (Cloud Run's disk is ephemeral). Tries the GCS object first when a
 * bucket is configured, falling back to the legacy Postgres blob tables -
 * both for rows not yet backfilled and for any environment with no bucket
 * configured. Content-type is inferred from the filename's extension rather
 * than an extra GCS metadata round trip (matches FilesController's disk-read
 * path) - a Postgres-backed hit still returns the exact mimetype captured at
 * upload.
 *
 * Fail-open on any GCS error other than a genuine not-found: still falls
 * through to the Postgres check rather than failing the request, but logs at
 * error level so a misconfigured/unreachable bucket in production doesn't
 * silently look like ordinary 404s.
 */
export function createDurableUploadFallback(category: FileCategory) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
      if (!filename) return next();

      if (isSecureBucketConfigured()) {
        try {
          const data = await downloadPrivateObject(`uploads/${category}/${filename}`);
          const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          res.send(data);
          return;
        } catch (err) {
          if ((err as { code?: number })?.code !== 404) {
            logger.error({ err, filename, category }, 'Failed to read durable upload from cloud storage');
          }
        }
      }

      const blob = (await MedicalInsuranceModel.getDocumentBlob(filename)) ?? (await FileBlobModel.get(filename));
      if (!blob) return next();
      res.setHeader('Content-Type', blob.mimeType);
      res.send(blob.data);
    } catch (error) {
      next(error);
    }
  };
}
