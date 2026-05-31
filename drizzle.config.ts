import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Determine if Cloud SQL connection should be used
 */
const isCloudSqlMode = () => {
  return !!(process.env.CLOUD_SQL_CONNECTION_NAME || process.env.DB_SOCKET_PATH);
};

/**
 * Get the socket path for Cloud SQL
 */
const getCloudSqlSocketPath = () => {
  if (process.env.DB_SOCKET_PATH) {
    return process.env.DB_SOCKET_PATH;
  }
  if (process.env.CLOUD_SQL_CONNECTION_NAME) {
    return `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`;
  }
  return null;
};

const dbConfig: any = {
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'oxo_carriers',
};

if (isCloudSqlMode()) {
  // Cloud SQL via Unix socket
  const socketPath = getCloudSqlSocketPath();
  dbConfig.host = socketPath;
  dbConfig.ssl = false; // Unix socket connections don't need SSL
} else {
  // Regular TCP connection
  dbConfig.host = process.env.DB_HOST || 'localhost';
  dbConfig.port = Number.parseInt(process.env.DB_PORT || '5432', 10);
  dbConfig.ssl =
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
}

export default {
  schema: './src/db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: dbConfig,
  // Specify the schema to generate migrations for
  schemaFilter: [process.env.DB_SCHEMA || 'public'],
} satisfies Config;
