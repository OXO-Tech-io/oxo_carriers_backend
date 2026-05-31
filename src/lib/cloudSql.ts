/**
 * Cloud SQL Utility Module
 * Handles Cloud SQL connection management and detection
 */

import { env } from '../config/env';
import logger from './logger';

/**
 * Cloud SQL connection information
 */
export interface CloudSqlConnectionInfo {
  isCloudSql: boolean;
  socketPath: string | null;
  connectionString: string | null;
  projectId?: string;
  region?: string;
  instanceName?: string;
}

/**
 * Parse Cloud SQL connection name into components
 * Format: PROJECT_ID:REGION:INSTANCE_NAME
 */
function parseCloudSqlConnectionName(connectionName: string): {
  projectId: string;
  region: string;
  instanceName: string;
} | null {
  logger.info(`Parsing Cloud SQL connection name: ${connectionName}`);
  const parts = connectionName.split(':');
  if (parts.length !== 3) {
    console.warn(
      `Invalid Cloud SQL connection name format: ${connectionName}. Expected PROJECT_ID:REGION:INSTANCE_NAME`,
    );
    return null;
  }
  return {
    projectId: parts[0],
    region: parts[1],
    instanceName: parts[2],
  };
}

/**
 * Get Cloud SQL connection information
 */
export function getCloudSqlConnectionInfo(): CloudSqlConnectionInfo {
  const socketPath =
    env.DB_SOCKET_PATH ||
    (env.CLOUD_SQL_CONNECTION_NAME
      ? `/cloudsql/${env.CLOUD_SQL_CONNECTION_NAME}`
      : null);

  if (!socketPath) {
    return {
      isCloudSql: false,
      socketPath: null,
      connectionString: null,
    };
  }

  const parsed = env.CLOUD_SQL_CONNECTION_NAME
    ? parseCloudSqlConnectionName(env.CLOUD_SQL_CONNECTION_NAME)
    : null;

  return {
    isCloudSql: true,
    socketPath,
    connectionString: env.CLOUD_SQL_CONNECTION_NAME || null,
    projectId: parsed?.projectId,
    region: parsed?.region,
    instanceName: parsed?.instanceName,
  };
}

/**
 * Check if running in Cloud SQL mode
 */
export function isCloudSqlMode(): boolean {
  return !!(env.CLOUD_SQL_CONNECTION_NAME || env.DB_SOCKET_PATH);
}

/**
 * Generate PostgreSQL connection string for Cloud SQL
 * This is used for tools like Drizzle Kit during development/migrations
 */
export function getCloudSqlConnectionString(): string | null {
  if (!isCloudSqlMode()) {
    return null;
  }

  const socketPath =
    env.DB_SOCKET_PATH ||
    (env.CLOUD_SQL_CONNECTION_NAME
      ? `/cloudsql/${env.CLOUD_SQL_CONNECTION_NAME}`
      : null);

  if (!socketPath) {
    return null;
  }

  // PostgreSQL connection string using Unix socket
  // Format: postgresql://USER:PASSWORD@/DATABASE?host=SOCKET_PATH
  const connectionString =
    `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@/` +
    `${env.DB_NAME}?host=${socketPath}`;

  return connectionString;
}

/**
 * Log Cloud SQL connection information (for debugging)
 */
export function logCloudSqlInfo(logger?: any): void {
  const info = getCloudSqlConnectionInfo();

  if (!info.isCloudSql) {
    if (logger) {
      logger.info('Database: Standard PostgreSQL connection (not Cloud SQL)');
      logger.info(`  Schema: ${env.DB_SCHEMA || 'public'}`);
    }
    return;
  }

  if (logger) {
    logger.info('Database: Google Cloud SQL (Unix socket connection)');
    if (info.projectId) {
      logger.info(`  Project: ${info.projectId}`);
    }
    if (info.region) {
      logger.info(`  Region: ${info.region}`);
    }
    if (info.instanceName) {
      logger.info(`  Instance: ${info.instanceName}`);
    }
    logger.info(`  Socket: ${info.socketPath}`);
    logger.info(`  Schema: ${env.DB_SCHEMA || 'public'}`);
  }
}
