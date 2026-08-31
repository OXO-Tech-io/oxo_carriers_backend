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
