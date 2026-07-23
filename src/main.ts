import 'reflect-metadata';
// Load + validate env first, same as the old app.ts - side effects of
// importing env.ts: reads .env, validates with Zod, exits on failure.
import { env, ENV_LOADED_FROM } from './config/env';
import { logger } from './lib/logger';
import { logCloudSqlInfo } from './lib/cloudSql';
import { pool } from './config/database';
import { calculateProRatedAnnualLeave } from './utils/leaveCalculation';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { allowedOrigins, isOriginAllowed } from './config/corsOrigins';

if (ENV_LOADED_FROM) {
  logger.info({ envFile: ENV_LOADED_FROM }, 'Loaded environment from file');
} else {
  logger.info('No .env file found; using process.env values');
}

logCloudSqlInfo(logger);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  logger.info(
    { allowedOrigins, nodeEnv: env.NODE_ENV, frontendUrl: env.FRONTEND_URL ?? null },
    'CORS configuration',
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          if (!env.IS_PRODUCTION) logger.debug('CORS: allowing request with no Origin header');
          return callback(null, true);
        }
        if (isOriginAllowed(origin)) {
          if (!env.IS_PRODUCTION) logger.debug({ origin }, 'CORS: allowing origin');
          return callback(null, true);
        }
        logger.warn({ origin, allowedOrigins, frontendUrl: env.FRONTEND_URL ?? null }, 'CORS: blocked origin');
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
      ],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
      maxAge: 86400,
    }),
  );

  // Handle preflight OPTIONS requests explicitly (critical for CORS with
  // newer path-to-regexp - wildcard routes can't be used safely).
  app.use((req: any, res: any, next: any) => {
    if (req.method !== 'OPTIONS') return next();
    const origin = req.headers.origin as string | undefined;
    if (isOriginAllowed(origin)) {
      if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
      } else {
        res.header('Access-Control-Allow-Origin', '*');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      );
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400');
      return res.sendStatus(204);
    }
    return res.status(403).json({ error: 'CORS policy: Origin not allowed' });
  });

  // ─── Security headers ────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  // ─── Request logging (pino-http) ─────────────────────────────────────────
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Serve uploaded files
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  const PORT = env.PORT;
  await app.listen(PORT);

  logger.info({ port: PORT, database: env.DB_NAME }, 'Server started');

  if (env.IS_PRODUCTION && !String(env.DB_PASSWORD ?? '').trim()) {
    logger.error(
      {
        cloudSqlConnectionName: env.CLOUD_SQL_CONNECTION_NAME ?? null,
        dbUser: env.DB_USER,
        dbName: env.DB_NAME,
      },
      'DB_PASSWORD is empty in production. Service started, but database authentication will fail until DB_PASSWORD is set.',
    );
  }

  try {
    const ping = await pool.query('SELECT now() AS server_time, current_schema() AS schema_name');
    logger.info(
      {
        db: env.DB_NAME,
        schema: env.DB_SCHEMA,
        serverTime: ping.rows[0]?.server_time,
        currentSchema: ping.rows[0]?.schema_name,
        cloudSqlConnectionName: env.CLOUD_SQL_CONNECTION_NAME ?? null,
      },
      'Database connection check passed on startup',
    );

    // 1. Self-seed default leave types if empty
    try {
      const typesCountRes = await pool.query('SELECT COUNT(*) FROM tbl_leave_types');
      const count = parseInt(typesCountRes.rows[0]?.count || '0');
      if (count === 0) {
        logger.info('Database tbl_leave_types table is empty. Inserting default leave types...');
        await pool.query(`
          INSERT INTO tbl_leave_types (name, description, max_days, is_active) VALUES
          ('Annual Leave', 'Annual paid leave', 21, true),
          ('Sick Leave', 'Medical sick leave', 14, true),
          ('Casual Leave', 'Short notice casual leave', 7, true)
        `);
        logger.info('Default leave types inserted successfully.');
      }
    } catch (seedError: any) {
      logger.error({ err: seedError }, 'Failed to self-seed default leave types on startup');
    }

    // 2. Initialize missing leave balances for existing employees
    try {
      logger.info('Checking leave balances for existing employees...');
      const employeesRes = await pool.query("SELECT id, hire_date FROM tbl_employee WHERE role = 'employee'");
      const employees = employeesRes.rows || [];

      const leaveTypesRes = await pool.query('SELECT id, name, max_days FROM tbl_leave_types WHERE is_active = true');
      const leaveTypes = leaveTypesRes.rows || [];

      const currentYear = new Date().getFullYear();
      let initializedBalancesCount = 0;

      for (const emp of employees as any[]) {
        for (const type of leaveTypes as any[]) {
          const checkRes = await pool.query(
            'SELECT 1 FROM tbl_employee_leave_balance WHERE user_id = $1 AND leave_type_id = $2 AND year = $3',
            [emp.id, type.id, currentYear],
          );
          if (checkRes.rows.length === 0) {
            const hireDate = emp.hire_date ? new Date(emp.hire_date) : new Date();
            let totalDays = type.max_days;
            if (
              type.name.toLowerCase() === 'annual' ||
              type.name.toLowerCase() === 'annual/paid leave' ||
              type.name.toLowerCase() === 'annual leave'
            ) {
              totalDays = calculateProRatedAnnualLeave(hireDate, currentYear);
            }
            await pool.query(
              'INSERT INTO tbl_employee_leave_balance (user_id, leave_type_id, total_days, used_days, remaining_days, year) VALUES ($1, $2, $3, 0, $3, $4)',
              [emp.id, type.id, totalDays, currentYear],
            );
            initializedBalancesCount++;
          }
        }
      }
      if (initializedBalancesCount > 0) {
        logger.info(`Initialized ${initializedBalancesCount} missing leave balance records for existing employees.`);
      } else {
        logger.info('All employee leave balances are up to date.');
      }
    } catch (balanceError: any) {
      logger.error({ err: balanceError }, 'Failed to check/initialize employee leave balances on startup');
    }

    // 3. Assign default permissions to existing employee accounts if they don't already have them
    try {
      logger.info('Checking default permissions for existing employees...');
      // tbl_user_permissions is keyed by the business employee_id (varchar),
      // not the numeric tbl_employee.id.
      const employeesRes = await pool.query(
        "SELECT employee_id FROM tbl_employee WHERE role = 'employee' AND employee_id IS NOT NULL",
      );
      const employeeIds = (employeesRes.rows || []).map((row: any) => row.employee_id);
      const defaultPermissions = [
        'dashboard',
        'leaves',
        'salaries',
        'facilities',
        'medical_claims',
        'reports',
        'work_logs',
        'communications',
        'forms',
      ];
      let assignedCount = 0;
      for (const empId of employeeIds) {
        for (const permission of defaultPermissions) {
          const checkRes = await pool.query(
            'SELECT 1 FROM tbl_user_permissions WHERE employee_id = $1 AND permission_key = $2',
            [empId, permission],
          );
          if (checkRes.rows.length === 0) {
            await pool.query(
              'INSERT INTO tbl_user_permissions (employee_id, permission_key, access_level) VALUES ($1, $2, $3)',
              [empId, permission, 'read'],
            );
            assignedCount++;
          }
        }
      }
      if (assignedCount > 0) {
        logger.info(`Assigned ${assignedCount} missing default permissions to employees in Postgres.`);
      } else {
        logger.info('All employee permissions are up to date in Postgres.');
      }
    } catch (syncError: any) {
      logger.error({ err: syncError }, 'Failed to check/assign default employee permissions on startup');
    }

    // 4. Grant HR managers/executives write access to Profile Change Requests
    try {
      logger.info('Checking profile_change_requests permission for HR users...');
      const hrRes = await pool.query(
        "SELECT employee_id FROM tbl_employee WHERE role IN ('hr_manager', 'hr_executive') AND employee_id IS NOT NULL",
      );
      const hrIds = (hrRes.rows || []).map((row: any) => row.employee_id);
      let hrAssignedCount = 0;
      for (const hrId of hrIds) {
        const checkRes = await pool.query(
          'SELECT access_level FROM tbl_user_permissions WHERE employee_id = $1 AND permission_key = $2',
          [hrId, 'profile_change_requests'],
        );
        if (checkRes.rows.length === 0) {
          await pool.query(
            'INSERT INTO tbl_user_permissions (employee_id, permission_key, access_level) VALUES ($1, $2, $3)',
            [hrId, 'profile_change_requests', 'write'],
          );
          hrAssignedCount++;
        } else if (checkRes.rows[0].access_level !== 'write') {
          await pool.query(
            'UPDATE tbl_user_permissions SET access_level = $3 WHERE employee_id = $1 AND permission_key = $2',
            [hrId, 'profile_change_requests', 'write'],
          );
          hrAssignedCount++;
        }
      }
      if (hrAssignedCount > 0) {
        logger.info(`Granted/updated profile_change_requests (write) for ${hrAssignedCount} HR users.`);
      } else {
        logger.info('All HR users already have profile_change_requests (write).');
      }
    } catch (hrPermError: any) {
      logger.error({ err: hrPermError }, 'Failed to check/assign HR profile_change_requests permission on startup');
    }

    // 5. Grant HR managers/executives write access to Communications, Events
    // and Forms, and HR managers write access to Work Logs.
    try {
      logger.info('Checking HR modules permissions for HR users...');
      const hrRes = await pool.query(
        "SELECT employee_id, role FROM tbl_employee WHERE role IN ('hr_manager', 'hr_executive') AND employee_id IS NOT NULL",
      );
      const grants: { employeeId: string; key: string }[] = [];
      for (const row of hrRes.rows as any[]) {
        for (const key of ['communications', 'events', 'forms']) {
          grants.push({ employeeId: row.employee_id, key });
        }
        if (row.role === 'hr_manager') {
          grants.push({ employeeId: row.employee_id, key: 'work_logs' });
        }
      }
      let hrModuleGrantCount = 0;
      for (const grant of grants) {
        const checkRes = await pool.query(
          'SELECT access_level FROM tbl_user_permissions WHERE employee_id = $1 AND permission_key = $2',
          [grant.employeeId, grant.key],
        );
        if (checkRes.rows.length === 0) {
          await pool.query(
            'INSERT INTO tbl_user_permissions (employee_id, permission_key, access_level) VALUES ($1, $2, $3)',
            [grant.employeeId, grant.key, 'write'],
          );
          hrModuleGrantCount++;
        } else if (checkRes.rows[0].access_level !== 'write') {
          await pool.query(
            'UPDATE tbl_user_permissions SET access_level = $3 WHERE employee_id = $1 AND permission_key = $2',
            [grant.employeeId, grant.key, 'write'],
          );
          hrModuleGrantCount++;
        }
      }
      if (hrModuleGrantCount > 0) {
        logger.info(`Granted/updated HR modules permissions for ${hrModuleGrantCount} assignments.`);
      } else {
        logger.info('All HR users already have HR modules permissions.');
      }
    } catch (hrModuleError: any) {
      logger.error({ err: hrModuleError }, 'Failed to check/assign HR modules permissions on startup');
    }
  } catch (error) {
    logger.error({ err: error, db: env.DB_NAME, schema: env.DB_SCHEMA }, 'Database connection check failed on startup');
  }

  try {
    const { getEmailServiceStatus } = await import('./config/email');
    const status = getEmailServiceStatus();
    if (status.overall) {
      logger.info({ host: status.smtp.host, user: status.smtp.user }, 'Email (SMTP) configuration ready');
    } else {
      logger.error('Email (SMTP) not configured - set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }
  } catch (error: any) {
    logger.error({ err: error }, 'Could not check email configuration');
  }
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
