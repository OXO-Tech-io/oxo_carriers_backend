import pino, { type Logger, type LoggerOptions } from 'pino';
import { env } from '../config/env';

// Payroll/HR fields that must never reach log output in plaintext. Listed as
// bare keys so they're caught however deep the merging object nests them -
// pino's redact only matches literal paths, so each name below is expanded
// into a handful of depth patterns (root, one level deep via `*.`, and two
// levels deep via `*.*.`) rather than relying on a single wildcard.
const HR_SENSITIVE_FIELDS = [
  // Salary/wage amounts (see Salary.ts - these were previously logged in
  // plaintext across the Excel bulk-import path).
  'salary',
  'basic_salary',
  'basicSalary',
  'local_salary',
  'localSalary',
  'localSalaryValue',
  'oxo_international_salary',
  'oxoInternationalSalary',
  'oxoInternationalSalaryValue',
  'fullSalary',
  'rawLocal',
  'rawOxo',
  'expectedLocal',
  'expectedOxo',
  'decryptedLocal',
  'decryptedOxo',
  'decryptedBasic',
  'total_earnings',
  'totalEarnings',
  'grossEarnings',
  'total_deductions',
  'totalDeductions',
  'deductions',
  'deduction',
  'salaryAdvanceDeductions',
  'epfDeduction',
  'net_salary',
  'netSalary',
  'allowances',
  'amount',
  'wage',
  'wages',
  // Other HR/PII fields worth blocking from logs by default.
  'bank_account',
  'bankAccount',
  'bank_account_number',
  'nic',
  'nic_number',
  'nationalId',
  'national_id',
  'passportNumber',
  'passport_number',
  'epf',
  'etf',
];

const hrRedactPaths = HR_SENSITIVE_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]);

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL ?? (env.IS_PRODUCTION ? 'info' : 'debug'),
  base: { service: 'oxo-carriers-backend' },
  // Avoid leaking auth headers and HR/payroll fields through logged objects.
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
      ...hrRedactPaths,
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
