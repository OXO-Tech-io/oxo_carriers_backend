import 'reflect-metadata';
// Load + validate env first, same as the old app.ts - side effects of
// importing env.ts: reads .env, validates with Zod, exits on failure.
import { env, ENV_LOADED_FROM } from './config/env';
import { logger } from './lib/logger';
import { logCloudSqlInfo } from './lib/cloudSql';
import { pool } from './config/database';
import { calculateProRatedAnnualLeave } from './utils/leaveCalculation';
import { getAllRoleDefaultPermissions } from './modules/permissions/rolePermissions.model';
import { PermissionAssignment } from './common/constants/permissions';

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
import { MedicalInsuranceModel } from './modules/medical-insurance/MedicalInsurance';

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

  // All API routes are versioned under /api/v1; uploads are served separately below.
  app.setGlobalPrefix('api/v1');

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

  // OCD-493: Cloud Run's local disk is ephemeral - a file multer wrote to
  // uploads/ on one instance is gone once that instance recycles (scale to
  // zero, a redeploy, or the request simply landing on a different
  // instance), which is what caused "Cannot GET /uploads/documents/..." for
  // claim documents submitted on previous days. express.static calls
  // next() on a miss, so this runs only when the on-disk copy is gone, and
  // serves the durable Postgres copy saved at upload time instead (see
  // MedicalInsuranceModel.persistDocumentBlob/getDocumentBlob).
  const serveMedicalClaimDocumentFallback = async (
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    try {
      const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
      const blob = filename ? await MedicalInsuranceModel.getDocumentBlob(filename) : null;
      if (!blob) return next();
      res.setHeader('Content-Type', blob.mimeType);
      res.send(blob.data);
    } catch (error) {
      next(error);
    }
  };
  app.use('/uploads/documents/:filename', serveMedicalClaimDocumentFallback);
  app.use('/uploads/others/:filename', serveMedicalClaimDocumentFallback);

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
      const employeesRes = await pool.query("SELECT id, employee_id, hire_date FROM tbl_employee WHERE role = 'employee'");
      const employees = employeesRes.rows || [];

      const leaveTypesRes = await pool.query('SELECT id, name, max_days FROM tbl_leave_types WHERE is_active = true');
      const leaveTypes = leaveTypesRes.rows || [];

      const currentYear = new Date().getFullYear();

      // One round trip for every existing (employee, leave type) pair this year,
      // instead of one SELECT per employee-x-leave-type combination below.
      const existingRes = await pool.query(
        'SELECT employee_id, leave_type_id FROM tbl_employee_leave_balance WHERE year = $1',
        [currentYear],
      );
      const existing = new Set((existingRes.rows || []).map((r: any) => `${r.employee_id}:${r.leave_type_id}`));

      const missingEmployeeIds: string[] = [];
      const missingLeaveTypeIds: number[] = [];
      const missingTotalDays: number[] = [];
      for (const emp of employees as any[]) {
        for (const type of leaveTypes as any[]) {
          if (existing.has(`${emp.employee_id}:${type.id}`)) continue;
          const hireDate = emp.hire_date ? new Date(emp.hire_date) : new Date();
          let totalDays = type.max_days;
          if (
            type.name.toLowerCase() === 'annual' ||
            type.name.toLowerCase() === 'annual/paid leave' ||
            type.name.toLowerCase() === 'annual leave'
          ) {
            totalDays = calculateProRatedAnnualLeave(hireDate, currentYear);
          }
          missingEmployeeIds.push(emp.employee_id);
          missingLeaveTypeIds.push(type.id);
          missingTotalDays.push(totalDays);
        }
      }

      // Single bulk insert regardless of how many rows are missing.
      await pool.query(
        `INSERT INTO tbl_employee_leave_balance (employee_id, leave_type_id, total_days, used_days, remaining_days, year)
         SELECT e, lt, td, 0, td, $4
         FROM unnest($1::varchar[], $2::integer[], $3::integer[]) AS x(e, lt, td)`,
        [missingEmployeeIds, missingLeaveTypeIds, missingTotalDays, currentYear],
      );

      if (missingEmployeeIds.length > 0) {
        logger.info(`Initialized ${missingEmployeeIds.length} missing leave balance records for existing employees.`);
      } else {
        logger.info('All employee leave balances are up to date.');
      }
    } catch (balanceError: any) {
      logger.error({ err: balanceError }, 'Failed to check/initialize employee leave balances on startup');
    }

    // 3. Assign default role permissions to existing employee accounts if
    // they don't already have them (OCD-445 / OCD-457). Every role with a
    // configured default in tbl_role_permissions (admin-editable via the
    // "Role Defaults" screen / PUT /permissions/roles/:role) is backfilled
    // here on every boot, not just EMPLOYEE - this used to be the only role
    // handled, which is why HR/Finance/Consultant accounts saw an
    // empty/partial side nav. Missing rows are inserted; rows that already
    // exist at 'read' are upgraded to 'write' when the role's default calls
    // for 'write'. Existing grants are never downgraded/removed here (an
    // admin may have hand-tuned them via the Permissions UI) - the one
    // exception (HR Executive losing profile_change_requests) is handled
    // explicitly in step 4 below.
    try {
      logger.info('Checking default role permissions for existing employees...');
      const roleDefaultsByRole = await getAllRoleDefaultPermissions();
      const roleEntries = Object.entries(roleDefaultsByRole) as [string, PermissionAssignment[]][];
      const rolesWithDefaults = roleEntries.map(([role]) => role);

      // tbl_user_permissions is keyed by the business employee_id (varchar),
      // not the numeric tbl_employee.id. `role` is a Postgres enum column, so
      // it's cast to text before comparing against the plain string array
      // parameter (enum = ANY(text[]) has no operator).
      const employeesRes = await pool.query(
        'SELECT employee_id, role::text AS role FROM tbl_employee WHERE role::text = ANY($1) AND employee_id IS NOT NULL',
        [rolesWithDefaults],
      );
      const employeeIdsByRole = new Map<string, string[]>();
      const allEmployeeIds: string[] = [];
      for (const row of employeesRes.rows as any[]) {
        allEmployeeIds.push(row.employee_id);
        const list = employeeIdsByRole.get(row.role) ?? [];
        list.push(row.employee_id);
        employeeIdsByRole.set(row.role, list);
      }

      // One round trip for every existing (employee, permission) pair,
      // instead of one SELECT per employee-x-permission combination below.
      const existingRes = await pool.query(
        'SELECT employee_id, permission_key, access_level FROM tbl_user_permissions WHERE employee_id = ANY($1)',
        [allEmployeeIds],
      );
      const accessLevelByPair = new Map(
        (existingRes.rows || []).map((r: any) => [`${r.employee_id}:${r.permission_key}`, r.access_level]),
      );

      const toInsertEmployeeIds: string[] = [];
      const toInsertKeys: string[] = [];
      const toInsertLevels: string[] = [];
      const toUpgradeEmployeeIds: string[] = [];
      const toUpgradeKeys: string[] = [];

      for (const [role, grants] of roleEntries) {
        for (const empId of employeeIdsByRole.get(role) ?? []) {
          for (const grant of grants) {
            const current = accessLevelByPair.get(`${empId}:${grant.key}`);
            if (current === undefined) {
              toInsertEmployeeIds.push(empId);
              toInsertKeys.push(grant.key);
              toInsertLevels.push(grant.accessLevel);
            } else if (current === 'read' && grant.accessLevel === 'write') {
              toUpgradeEmployeeIds.push(empId);
              toUpgradeKeys.push(grant.key);
            }
          }
        }
      }

      // Single bulk insert/update regardless of how many rows are missing.
      await pool.query(
        `INSERT INTO tbl_user_permissions (employee_id, permission_key, access_level)
         SELECT e, k, l::access_level
         FROM unnest($1::varchar[], $2::varchar[], $3::varchar[]) AS x(e, k, l)`,
        [toInsertEmployeeIds, toInsertKeys, toInsertLevels],
      );
      await pool.query(
        `UPDATE tbl_user_permissions t
         SET access_level = 'write'
         FROM unnest($1::varchar[], $2::varchar[]) AS g(employee_id, permission_key)
         WHERE t.employee_id = g.employee_id AND t.permission_key = g.permission_key`,
        [toUpgradeEmployeeIds, toUpgradeKeys],
      );

      const grantCount = toInsertEmployeeIds.length + toUpgradeEmployeeIds.length;
      if (grantCount > 0) {
        logger.info(`Granted/updated ${grantCount} default role permission assignment(s).`);
      } else {
        logger.info('All employees already have their default role permissions.');
      }
    } catch (syncError: any) {
      logger.error({ err: syncError }, 'Failed to check/assign default role permissions on startup');
    }

    // 4. OCD-473: Profile Approvals (profile_change_requests) is restricted
    // to Administrator/HR Manager only. Earlier versions of this bootstrap
    // (and step 3 above, before this fix) granted it to HR Executive too -
    // revoke any leftover grant so already-provisioned HR Executive accounts
    // lose both the Profile Approvals menu and decision capability, not just
    // new accounts.
    try {
      logger.info('Revoking profile_change_requests from HR Executive users (OCD-473)...');
      const result = await pool.query(
        `DELETE FROM tbl_user_permissions
         WHERE permission_key = 'profile_change_requests'
           AND employee_id IN (
             SELECT employee_id FROM tbl_employee WHERE role = 'hr_executive' AND employee_id IS NOT NULL
           )`,
      );
      if (result.rowCount) {
        logger.info(`Revoked profile_change_requests from ${result.rowCount} HR Executive user(s).`);
      }
    } catch (revokeError: any) {
      logger.error({ err: revokeError }, 'Failed to revoke profile_change_requests from HR Executive users on startup');
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
