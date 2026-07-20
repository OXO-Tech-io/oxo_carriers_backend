import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from the first matching location. `override: false` means
// anything already in process.env (e.g. set by the host or container) wins.
const candidatePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];
let loadedFrom: string | null = null;
for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    const result = dotenv.config({ path: p, override: false });
    if (!result.error) {
      loadedFrom = p;
      break;
    }
  }
}
if (!loadedFrom) {
  // Fall back to default dotenv behavior; harmless if no file is found.
  dotenv.config({ override: false });
}
// Tracked so the logger can report it after startup (it can't depend on
// console here — we hold this until app.ts wires the logger).
export const ENV_LOADED_FROM = loadedFrom;

const boolish = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === 'true' || v === '1');

const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url().optional(),
);

const Schema = z.object({
  // ─── Runtime ────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),

  // ─── Database (Postgres) ────────────────────────────────────────────────
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1).default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_PASSWORD_FILE: optionalString,
  DB_NAME: z.string().min(1).default('oxo_carriers'),
  DB_SCHEMA: z.string().min(1).default('public'),
  DB_SSL: boolish.default(false),

  // ─── Cloud SQL (GCP) ────────────────────────────────────────────────────
  /** When true, use Cloud SQL proxy socket connection (e.g., /cloudsql/PROJECT:REGION:INSTANCE) */
  CLOUD_SQL_CONNECTION_NAME: optionalString,
  /** Path to the Cloud SQL proxy socket (computed if CLOUD_SQL_CONNECTION_NAME is set) */
  DB_SOCKET_PATH: optionalString,
  /** Port where Cloud SQL proxy listens (only used when running proxy separately) */
  CLOUD_SQL_PROXY_PORT: z.coerce.number().int().positive().default(5433),

  // ─── Keycloak ───────────────────────────────────────────────────────────
  KC_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().default('http://localhost:5400'),
  ),
  KC_REALM: z.string().min(1).default('hris'),
  /** Comma-separated list of accepted audiences. Empty disables aud check. */
  KC_AUDIENCE: optionalString,
  KC_BACKEND_CLIENT_ID: z.string().default('oxo-hris-backend'),
  /** Required only when the backend calls Keycloak's admin API. */
  KC_BACKEND_CLIENT_SECRET: optionalString,
  KC_FRONTEND_CLIENT_ID: optionalString,

  // ─── CORS ───────────────────────────────────────────────────────────────
  FRONTEND_URL: optionalUrl,
  ALLOWED_ORIGINS: optionalString,

  // ─── EmailJS ────────────────────────────────────────────────────────────
  EMAILJS_SERVICE_ID: optionalString,
  EMAILJS_TEMPLATE_ID: optionalString,
  EMAILJS_WELCOME_TEMPLATE_ID: optionalString,
  EMAILJS_RESET_TEMPLATE_ID: optionalString,
  EMAILJS_VERIFY_TEMPLATE_ID: optionalString,
  EMAILJS_PUBLIC_KEY: optionalString,
  EMAILJS_PRIVATE_KEY: optionalString,

  // ─── SMTP ───────────────────────────────────────────────────────────────
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: boolish.default(false),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,

  // ─── JWT Authentication ─────────────────────────────────────────────────
  JWT_SECRET: z.string().min(32).default('your-super-secret-key-min-32-chars-required'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // ─── Encryption ─────────────────────────────────────────────────────────
  /** Used to derive the AES-256 key for PII fields (users.bankName/contactNumber/etc, via encryptPII) and pgcrypto's pgp_sym_encrypt (tbl_employee_pii). */
  PII_ENCRYPTION_KEY: z.string().min(1).default('default-pii-encryption-key-must-change-in-prod'),
  /** 64-character hex string (32 bytes). Only required if/when encryptSalary/decryptSalary are called. */
  SALARY_ENCRYPTION_KEY: optionalString,
});

export type Env = z.infer<typeof Schema>;

const parsed = Schema.safeParse(process.env);

if (!parsed.success) {
  // Use console here on purpose — the logger depends on this module, so we
  // can't import it without a cycle, and validation failure should be loud.
  // eslint-disable-next-line no-console
  console.error('\n❌ Invalid environment configuration:\n');
  for (const issue of parsed.error.issues) {
    const path = issue.path.join('.') || '(root)';
    // eslint-disable-next-line no-console
    console.error(`  • ${path}: ${issue.message}`);
  }
  // eslint-disable-next-line no-console
  console.error(
    '\nFix the issues above (or your .env file) and restart.\n',
  );
  process.exit(1);
}

// NOTE: DB_PASSWORD absence is warned at server startup in app.ts, not here.
// Exiting here would kill the container before it binds to PORT, causing
// Cloud Run "container failed to start" errors.

export const env: Env & {
  IS_PRODUCTION: boolean;
  IS_DEVELOPMENT: boolean;
  IS_TEST: boolean;
} = Object.assign({}, parsed.data, {
  DB_PASSWORD: (() => {
    const inlinePassword = parsed.data.DB_PASSWORD;
    if (typeof inlinePassword === 'string' && inlinePassword.trim().length > 0) {
      return inlinePassword;
    }

    const filePath = parsed.data.DB_PASSWORD_FILE;
    if (!filePath) {
      return inlinePassword;
    }

    try {
      const fromFile = fs.readFileSync(filePath, 'utf8').trim();
      if (fromFile.length > 0) {
        // eslint-disable-next-line no-console
        console.info(`Loaded DB password from file: ${filePath}`);
        return fromFile;
      }
      // eslint-disable-next-line no-console
      console.warn(`DB_PASSWORD_FILE is set but empty: ${filePath}`);
      return inlinePassword;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to read DB_PASSWORD_FILE at ${filePath}:`, error);
      return inlinePassword;
    }
  })(),
  IS_PRODUCTION: parsed.data.NODE_ENV === 'production',
  IS_DEVELOPMENT: parsed.data.NODE_ENV === 'development',
  IS_TEST: parsed.data.NODE_ENV === 'test',
});

export default env;
