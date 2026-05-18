import pino, { type Logger, type LoggerOptions } from 'pino';
import { env } from '../config/env';

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL ?? (env.IS_PRODUCTION ? 'info' : 'debug'),
  base: { service: 'oxo-carriers-backend' },
  // Avoid leaking auth headers through req-log.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.access_token',
      '*.refresh_token',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
};

const prettyOptions: LoggerOptions = {
  ...baseOptions,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname,service',
      singleLine: false,
    },
  },
};

/**
 * Singleton logger.
 *   - In development (NODE_ENV != production): colorful pretty output.
 *   - In production: single-line JSON for log aggregators.
 *
 * Use `logger.child({ ... })` to add structured context to a subsystem.
 * Use `req.log` inside route handlers — `pino-http` attaches a request-scoped
 * child logger with a `req.id` correlation field.
 */
export const logger: Logger = pino(
  env.IS_PRODUCTION ? baseOptions : prettyOptions,
);

export default logger;
