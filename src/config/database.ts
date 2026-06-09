// backend/src/config/database.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from './env';
import * as schema from '../db/schema';

/**
 * Determines if Cloud SQL connection should be used
 * - If CLOUD_SQL_CONNECTION_NAME is set, use Cloud SQL proxy socket
 * - If DB_SOCKET_PATH is set, use that Unix socket directly
 * Otherwise use regular TCP connection
 */
export const isCloudSqlMode = () => {
  return !!(env.CLOUD_SQL_CONNECTION_NAME || env.DB_SOCKET_PATH);
};

/**
 * Get the socket path for Cloud SQL
 * When running in Cloud Run, the socket is typically at:
 * /cloudsql/{PROJECT_ID}:{REGION}:{INSTANCE_NAME}
 */
const getCloudSqlSocketPath = () => {
  if (env.DB_SOCKET_PATH) {
    return env.DB_SOCKET_PATH;
  }
  if (env.CLOUD_SQL_CONNECTION_NAME) {
    return `/cloudsql/${env.CLOUD_SQL_CONNECTION_NAME}`;
  }
  return null;
};

const poolConfig: any = {
  user: env.DB_USER,
  // Password can come from DB_PASSWORD or DB_PASSWORD_FILE (resolved in env.ts).
  password: String(env.DB_PASSWORD ?? '').trim(),
  database: env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Set the schema (search_path) for all connections
  statement_timeout: 30000,
};

if (!poolConfig.password) {
  console.warn(
    '[DB] DB_PASSWORD is empty. Authentication to PostgreSQL will fail unless the user has no password.',
  );
}

if (isCloudSqlMode()) {
  // Cloud SQL via Unix socket
  const socketPath = getCloudSqlSocketPath();
  if (!socketPath) {
    throw new Error(
      'Cloud SQL mode enabled but no socket path found. ' +
      'Set CLOUD_SQL_CONNECTION_NAME or DB_SOCKET_PATH.',
    );
  }
  poolConfig.host = socketPath;
  // SSL is not needed for Unix socket connections to Cloud SQL
  poolConfig.ssl = false;
} else {
  // Regular TCP connection
  poolConfig.host = env.DB_HOST;
  poolConfig.port = env.DB_PORT;
  poolConfig.ssl = env.DB_SSL ? { rejectUnauthorized: false } : false;
}

const pool = new Pool(poolConfig);

// Set schema (search_path) for all connections
// This ensures that queries use the correct schema without explicit qualification
if (env.DB_SCHEMA && env.DB_SCHEMA !== 'public') {
  pool.on('connect', async (client) => {
    try {
      await client.query(`SET search_path TO ${env.DB_SCHEMA}, public`);
    } catch (error) {
      console.error(`Failed to set schema to ${env.DB_SCHEMA}:`, error);
      // Continue anyway - some queries might still work
    }
  });
}

export const db = drizzle(pool, { schema });
export { pool };
export default pool;
