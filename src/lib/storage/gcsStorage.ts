import { Storage } from '@google-cloud/storage';
import { env } from '../../config/env';

const SIGNED_URL_VERSION = 'v4' as const;
const SIGNED_URL_ACTION_READ = 'read' as const;
const SIGNED_URL_ACTION_WRITE = 'write' as const;
const DEFAULT_READ_URL_TTL_SECONDS = 15 * 60;
const DEFAULT_UPLOAD_URL_TTL_SECONDS = 10 * 60;

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
export async function getPrivateObjectSignedUrl(objectKey: string, expiresInSeconds = DEFAULT_READ_URL_TTL_SECONDS): Promise<string> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  const [url] = await bucket.file(objectKey).getSignedUrl({
    version: SIGNED_URL_VERSION,
    action: SIGNED_URL_ACTION_READ,
    expires: Date.now() + expiresInSeconds * 1000,
  });
  return url;
}

/** Short-lived signed PUT URL so a trusted client (the activity agent) can upload straight to GCS; the caller must send the same Content-Type. */
export async function getPrivateObjectUploadUrl(
  objectKey: string,
  contentType: string,
  expiresInSeconds = DEFAULT_UPLOAD_URL_TTL_SECONDS,
): Promise<string> {
  if (!env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not configured');
  }
  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  const [url] = await bucket.file(objectKey).getSignedUrl({
    version: SIGNED_URL_VERSION,
    action: SIGNED_URL_ACTION_WRITE,
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

export interface StorageHealthStep {
  step: string;
  ok: boolean;
  detail?: string;
  /** What to change in GCP when this step fails. */
  hint?: string;
}

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Maps a raw GCS/IAM error to the GCP change that usually fixes it. */
export function storageErrorHint(message: string): string | undefined {
  const m = message.toLowerCase();
  if (m.includes('signblob') || m.includes('iam.serviceaccounts') || m.includes('iamcredentials') || m.includes('sign blob')) {
    return (
      'Signing needs the runtime service account to sign as itself: grant it roles/iam.serviceAccountTokenCreator ' +
      '(on itself) and enable the "IAM Service Account Credentials API" (iamcredentials.googleapis.com). ' +
      'Alternatively set GCS_KEY_FILE to a service-account key file.'
    );
  }
  if (m.includes('could not load the default credentials') || m.includes('could not find default credentials')) {
    return 'No Google credentials found. On Cloud Run set --service-account; locally set GCS_KEY_FILE or run gcloud auth application-default login.';
  }
  if (m.includes('does not exist') || m.includes('notfound') || m.includes('not found')) {
    return 'The bucket was not found. Check GCS_BUCKET_NAME and that it lives in GCS_PROJECT_ID.';
  }
  if (m.includes('403') || m.includes('forbidden') || m.includes('does not have storage.objects') || m.includes('permission')) {
    return 'The service account lacks bucket access: grant roles/storage.objectAdmin (or objectCreator + objectViewer + delete) on the bucket.';
  }
  return undefined;
}

/**
 * Walks every GCP capability the screenshot pipeline relies on, so "screenshots do not show"
 * can be pinned to one failing step: configuration, bucket, write, read, delete, and signing
 * of both the read URL (frontend) and the upload URL (agent).
 */
export async function checkStorageHealth(): Promise<{ ok: boolean; bucket: string | null; steps: StorageHealthStep[] }> {
  const steps: StorageHealthStep[] = [];
  const run = async (step: string, fn: () => Promise<string | void>) => {
    try {
      const detail = await fn();
      steps.push({ step, ok: true, ...(detail ? { detail } : {}) });
      return true;
    } catch (err) {
      const detail = describeError(err);
      steps.push({ step, ok: false, detail, hint: storageErrorHint(detail) });
      return false;
    }
  };

  if (!env.GCS_BUCKET_NAME) {
    steps.push({
      step: 'configuration',
      ok: false,
      detail: 'GCS_BUCKET_NAME is empty',
      hint: 'Set the GCS_BUCKET_NAME and GCS_PROJECT_ID repository variables used by the deploy workflow (Settings > Secrets and variables > Actions > Variables), then redeploy.',
    });
    return { ok: false, bucket: null, steps };
  }
  steps.push({ step: 'configuration', ok: true, detail: `bucket=${env.GCS_BUCKET_NAME} project=${env.GCS_PROJECT_ID ?? '(default)'}` });

  const bucket = getClient().bucket(env.GCS_BUCKET_NAME);
  const key = `healthchecks/${Date.now()}.txt`;
  const exists = await run('bucket exists', async () => {
    const [found] = await bucket.exists();
    if (!found) throw new Error(`Bucket ${env.GCS_BUCKET_NAME} does not exist`);
  });
  if (exists) {
    const wrote = await run('write object', async () => {
      await uploadPrivateObject(key, Buffer.from('ok'), 'text/plain');
    });
    if (wrote) {
      await run('read object', async () => {
        const data = await downloadPrivateObject(key);
        if (data.toString() !== 'ok') throw new Error('Read back different content than written');
      });
      await run('delete object', () => deletePrivateObject(key));
    }
  }
  await run('sign read URL', async () => {
    await getPrivateObjectSignedUrl(key, 60);
  });
  await run('sign upload URL', async () => {
    await getPrivateObjectUploadUrl(key, 'image/jpeg', 60);
  });
  return { ok: steps.every((s) => s.ok), bucket: env.GCS_BUCKET_NAME, steps };
}
