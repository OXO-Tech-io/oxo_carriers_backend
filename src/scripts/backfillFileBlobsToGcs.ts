import path from 'path';
import pool from '../config/database';
import { isSecureBucketConfigured, uploadPrivateObject, privateObjectExists } from '../lib/storage/gcsStorage';
import { FILE_CATEGORIES } from '../common/constants/fileCategories';

// Manual, one-off migration - NOT run automatically by CI/CD (mirrors every
// other db:* script in this repo). Uploads the durable copies already sitting
// in Postgres (tbl_file_blobs, tbl_medical_insurance_claim_documents) into the
// GCS bucket the app now also writes new uploads to (see AttachmentModel,
// notices.service.ts's persistImage, MedicalInsuranceService.persistUploadedDocuments),
// so files uploaded before that change get a matching GCS copy too, and these
// tables can eventually be drained.
//
// Requires GCS_BUCKET_NAME to be configured - refuses to run otherwise, since
// there is nowhere to upload to.
//
// Uploads first; only DELETES a migrated Postgres row when --delete-migrated
// is passed, so a first run can upload-and-verify (spot-check the bucket)
// before anything is removed. Safe to re-run: already-uploaded objects are
// skipped via privateObjectExists.
//
// tbl_medical_insurance_claim_documents rows are always uploads/documents/<filename>
// - no lookup needed. tbl_file_blobs has no category/URL column of its own,
// so each row's category is recovered by joining its filename against
// tbl_attachments.file_url / tbl_notices.image_url (both store the full
// /uploads/<category>/<filename> string). A blob matching neither (its owning
// attachment/notice was already deleted) is skipped and logged rather than
// guessed - leaving it in Postgres is harmless, since the app's read-side
// fallback (serve-durable-upload-fallback.ts) keeps serving it indefinitely.
//
// Run: pnpm db:backfill-file-blobs-to-gcs [-- --delete-migrated]

const shouldDelete = process.argv.includes('--delete-migrated');

async function migrateMedicalInsuranceDocuments(): Promise<{ uploaded: number; skipped: number; deleted: number }> {
  const result = await pool.query(`SELECT filename, mime_type, data FROM tbl_medical_insurance_claim_documents`);
  const rows = result.rows as { filename: string; mime_type: string; data: Buffer }[];

  let uploaded = 0;
  let skipped = 0;
  let deleted = 0;
  for (const row of rows) {
    const objectKey = `uploads/${FILE_CATEGORIES.DOCUMENTS}/${row.filename}`;
    if (await privateObjectExists(objectKey)) {
      console.log(`  - already migrated: ${row.filename}`);
      skipped++;
    } else {
      await uploadPrivateObject(objectKey, row.data, row.mime_type);
      console.log(`  ✓ uploaded ${row.filename} -> ${objectKey}`);
      uploaded++;
    }
    if (shouldDelete) {
      await pool.query(`DELETE FROM tbl_medical_insurance_claim_documents WHERE filename = $1`, [row.filename]);
      deleted++;
    }
  }
  return { uploaded, skipped, deleted };
}

async function migrateFileBlobs(): Promise<{ uploaded: number; skipped: number; deleted: number; orphaned: number }> {
  const result = await pool.query(`SELECT filename, mime_type, data FROM tbl_file_blobs`);
  const rows = result.rows as { filename: string; mime_type: string; data: Buffer }[];

  const attachmentUrls = await pool.query(`SELECT file_url FROM tbl_attachments`);
  const noticeUrls = await pool.query(`SELECT image_url FROM tbl_notices WHERE image_url IS NOT NULL`);
  const categoryByFilename = new Map<string, string>();
  for (const { file_url } of attachmentUrls.rows as { file_url: string }[]) {
    categoryByFilename.set(path.basename(file_url), path.basename(path.dirname(file_url)));
  }
  for (const { image_url } of noticeUrls.rows as { image_url: string }[]) {
    categoryByFilename.set(path.basename(image_url), path.basename(path.dirname(image_url)));
  }

  let uploaded = 0;
  let skipped = 0;
  let deleted = 0;
  let orphaned = 0;
  for (const row of rows) {
    const category = categoryByFilename.get(row.filename);
    if (!category) {
      console.log(`  ! skipping ${row.filename} - no matching attachment/notice found (left in Postgres)`);
      orphaned++;
      continue;
    }
    const objectKey = `uploads/${category}/${row.filename}`;
    if (await privateObjectExists(objectKey)) {
      console.log(`  - already migrated: ${row.filename}`);
      skipped++;
    } else {
      await uploadPrivateObject(objectKey, row.data, row.mime_type);
      console.log(`  ✓ uploaded ${row.filename} -> ${objectKey}`);
      uploaded++;
    }
    if (shouldDelete) {
      await pool.query(`DELETE FROM tbl_file_blobs WHERE filename = $1`, [row.filename]);
      deleted++;
    }
  }
  return { uploaded, skipped, deleted, orphaned };
}

async function backfillFileBlobsToGcs() {
  try {
    if (!isSecureBucketConfigured()) {
      console.error('❌ GCS_BUCKET_NAME is not configured - refusing to run (nowhere to upload to).');
      process.exit(1);
    }

    console.log(
      shouldDelete
        ? '🔧 Backfilling Postgres file blobs to GCS (uploaded rows will be DELETED from Postgres)...'
        : '🔧 Backfilling Postgres file blobs to GCS (upload-only - pass --delete-migrated to also remove migrated rows)...',
    );

    console.log('Medical insurance claim documents:');
    const medical = await migrateMedicalInsuranceDocuments();

    console.log('Generic file blobs (attachments/notices):');
    const blobs = await migrateFileBlobs();

    console.log('✅ Done.');
    console.log(`  medical insurance: ${medical.uploaded} uploaded, ${medical.skipped} already migrated, ${medical.deleted} deleted`);
    console.log(
      `  file blobs: ${blobs.uploaded} uploaded, ${blobs.skipped} already migrated, ${blobs.deleted} deleted, ${blobs.orphaned} orphaned/skipped`,
    );
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error backfilling file blobs to GCS:', error);
    process.exit(1);
  }
}

backfillFileBlobsToGcs();
