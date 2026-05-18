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
  DB_NAME: z.string().min(1).default('oxo_carriers'),
  DB_SSL: boolish.default(false),

  // ─── Legacy JWT ─────────────────────────────────────────────────────────
  // No longer used for sign-in (Keycloak owns identity). Kept for any
  // straggler code path that still reads it.
  JWT_SECRET: z.string().min(8).default('change-me-in-prod'),

  // ─── Keycloak ───────────────────────────────────────────────────────────
  KC_URL: z.string().url().default('http://localhost:5400'),
  KC_REALM: z.string().min(1).default('hris'),
  /** Comma-separated list of accepted audiences. Empty disables aud check. */
  KC_AUDIENCE: z.string().optional(),
  KC_BACKEND_CLIENT_ID: z.string().default('oxo-hris-backend'),
  /** Required only when the backend calls Keycloak's admin API. */
  KC_BACKEND_CLIENT_SECRET: z.string().optional(),
  KC_FRONTEND_CLIENT_ID: z.string().optional(),

  // ─── CORS ───────────────────────────────────────────────────────────────
  FRONTEND_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().optional(),

  // ─── EmailJS ────────────────────────────────────────────────────────────
  EMAILJS_SERVICE_ID: z.string().optional(),
  EMAILJS_TEMPLATE_ID: z.string().optional(),
  EMAILJS_WELCOME_TEMPLATE_ID: z.string().optional(),
  EMAILJS_RESET_TEMPLATE_ID: z.string().optional(),
  EMAILJS_VERIFY_TEMPLATE_ID: z.string().optional(),
  EMAILJS_PUBLIC_KEY: z.string().optional(),
  EMAILJS_PRIVATE_KEY: z.string().optional(),
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

export const env: Env & {
  IS_PRODUCTION: boolean;
  IS_DEVELOPMENT: boolean;
  IS_TEST: boolean;
} = Object.assign({}, parsed.data, {
  IS_PRODUCTION: parsed.data.NODE_ENV === 'production',
  IS_DEVELOPMENT: parsed.data.NODE_ENV === 'development',
  IS_TEST: parsed.data.NODE_ENV === 'test',
});

export default env;
