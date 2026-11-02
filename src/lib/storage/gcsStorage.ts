import { Storage } from '@google-cloud/storage';
import { env } from '../../config/env';

let storageClient: Storage | null = null;

function getClient(): Storage {
  if (!storageClient) {
    storageClient = new Storage({
      projectId: env.GCS_PROJECT_ID,
      keyFilename: env.GCS_KEY_FILE,
    });
  }
  return storageClient;
}

/** Whether a private bucket is configured. When false, HR/payroll documents should be generated on demand and never persisted. */
export function isSecureBucketConfigured(): boolean {
  return Boolean(env.GCS_BUCKET_NAME);
}

/**
 * Uploads a buffer to the private GCS bucket under `objectKey`. Never sets a
 * public/predefined ACL - the bucket itself must be private (uniform
 * bucket-level access, no allUsers/allAuthenticatedUsers bindings); access is
 * only ever granted by an authenticated controller calling downloadPrivateObject.
 */
export async function uploadPrivateObject(objectKey: string, data: Buffer, contentType: string): Promise<void> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  await bucket.file(objectKey).save(data, {
    contentType,
    resumable: false,
    metadata: { cacheControl: 'private, max-age=0, no-store' },
  });
}

export async function downloadPrivateObject(objectKey: string): Promise<Buffer> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  const [data] = await bucket.file(objectKey).download();
  return data;
}

/** Best-effort delete - a missing object is not an error (matches the delete-by-filename semantics of the Postgres blob tables this is replacing). */
export async function deletePrivateObject(objectKey: string): Promise<void> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  await bucket.file(objectKey).delete({ ignoreNotFound: true });
}

/** Used by the file-blob backfill script to skip re-uploading an object a previous, interrupted run already migrated. */
export async function privateObjectExists(objectKey: string): Promise<boolean> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  const [exists] = await bucket.file(objectKey).exists();
  return exists;
}

/** Short-lived read URL for a private object, so the browser can load it straight from GCS without proxying the bytes through the API. */
export async function getPrivateObjectSignedUrl(objectKey: string, expiresInSeconds = 15 * 60): Promise<string> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  const [url] = await bucket.file(objectKey).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInSeconds * 1000,
  });
  return url;
}

/** Short-lived signed PUT URL so a trusted client (the activity agent) can upload straight to GCS; the caller must send the same Content-Type. */
export async function getPrivateObjectUploadUrl(
  objectKey: string,
  contentType: string,
  expiresInSeconds = 10 * 60,
): Promise<string> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  const [url] = await bucket.file(objectKey).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + expiresInSeconds * 1000,
    contentType,
  });
  return url;
}

/** Size of a stored object in bytes, or null when it does not exist. */
export async function getPrivateObjectSize(objectKey: string): Promise<number | null> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const file = getClient().bucket(env.GCS_BUCKET_NAME).file(objectKey);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  return Number(meta.size);
}
