// Load + validate env first. Side effects of importing env.ts:
//   1. Reads .env from project root (or container env vars).
//   2. Validates with Zod and exits on failure.
// All other imports below see a fully populated, typed `env`.
import { env, ENV_LOADED_FROM } from './config/env';
import { logger } from './lib/logger';
import { logCloudSqlInfo } from './lib/cloudSql';
import { pool } from './config/database';
import { calculateProRatedAnnualLeave } from './utils/leaveCalculation';

import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import leaveRoutes from './routes/leaveRoutes';
import leaveCalendarRoutes from './routes/leaveCalendarRoutes';
import salaryRoutes from './routes/salaryRoutes';
import reportRoutes from './routes/reportRoutes';
import facilityRoutes from './routes/facilityRoutes';
import medicalInsuranceRoutes from './routes/medicalInsuranceRoutes';
import consultantSubmissionRoutes from './routes/consultantSubmissionRoutes';
import voucherRoutes from './routes/voucherRoutes';
import vendorRoutes from './routes/vendorRoutes';
import permissionRoutes from './routes/permissionRoutes';
import profileChangeRequestRoutes from './routes/profileChangeRequestRoutes';
import employeeEducationRoutes from './routes/employeeEducationRoutes';
import employeeWorkHistoryRoutes from './routes/employeeWorkHistoryRoutes';
import employeePiiRoutes from './routes/employeePiiRoutes';
import employeeNomineeRoutes from './routes/employeeNomineeRoutes';
import employeeDependentRoutes from './routes/employeeDependentRoutes';
import employeeEmergencyContactRoutes from './routes/employeeEmergencyContactRoutes';
import employeeWelfareInfoRoutes from './routes/employeeWelfareInfoRoutes';
import notificationRoutes from './routes/notificationRoutes';
import employeeNoteRoutes from './routes/employeeNoteRoutes';
import communicationRoutes from './routes/communicationRoutes';
import eventRoutes from './routes/eventRoutes';
import formRoutes from './routes/formRoutes';
import workLogRoutes from './routes/workLogRoutes';
import groupRoutes from './routes/groupRoutes';

if (ENV_LOADED_FROM) {
  logger.info({ envFile: ENV_LOADED_FROM }, 'Loaded environment from file');
} else {
  logger.info('No .env file found; using process.env values');
}

// Log Cloud SQL configuration
logCloudSqlInfo(logger);

const app = express();
const PORT = env.PORT;

// ─── CORS ────────────────────────────────────────────────────────────────
const normalizeOrigin = (origin?: string | null): string => {
  if (!origin) return '';
  return origin.trim().replace(/\/$/, '').toLowerCase();
};

const rawAllowedOrigins = [
  'https://oxo-carriers-frontend-297614602590.us-central1.run.app',
  'http://localhost:3000',
  'http://localhost:5173',
  env.FRONTEND_URL,
  ...(env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? []),
].filter(Boolean) as string[];

const allowedOrigins = rawAllowedOrigins
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const isLocalDevOrigin = (origin: string) =>
  origin.includes('localhost') || origin.includes('127.0.0.1');

const isOriginAllowed = (origin?: string | null) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  if (!env.IS_PRODUCTION && isLocalDevOrigin(normalizedOrigin)) return true;
  return false;
};

logger.info(
  {
    allowedOrigins,
    nodeEnv: env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL ?? null,
  },
  'CORS configuration',
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        if (!env.IS_PRODUCTION) {
          logger.debug('CORS: allowing request with no Origin header');
        }
        return callback(null, true);
      }
      if (isOriginAllowed(origin)) {
        if (!env.IS_PRODUCTION) {
          logger.debug({ origin }, 'CORS: allowing origin');
        }
        return callback(null, true);
      }
      logger.warn(
        { origin, allowedOrigins, frontendUrl: env.FRONTEND_URL ?? null },
        'CORS: blocked origin',
      );
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

// Handle preflight OPTIONS requests explicitly (critical for CORS with newer
// path-to-regexp — wildcard routes can't be used safely).
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') return next();
  const origin = req.headers.origin as string | undefined;
  if (isOriginAllowed(origin)) {
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    );
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Request logging (pino-http) ─────────────────────────────────────────
// Attaches `req.log` (child logger with `req.id`) and auto-logs each
// completed request with method, url, status, response time. Replaces the
// hand-rolled `[Server] 📨 …` middleware.
app.use(
  pinoHttp({
    logger,
    genReqId: (req) =>
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/leave-calendar', leaveCalendarRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/medical-insurance', medicalInsuranceRoutes);
app.use('/api/consultant-submissions', consultantSubmissionRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/profile-change-requests', profileChangeRequestRoutes);
app.use('/api/employees/:employeeId/educations', employeeEducationRoutes);
app.use('/api/employees/:employeeId/work-histories', employeeWorkHistoryRoutes);
app.use('/api/employee-pii', employeePiiRoutes);
app.use('/api/employees/:employeeId/nominees', employeeNomineeRoutes);
app.use('/api/employees/:employeeId/dependents', employeeDependentRoutes);
app.use('/api/employees/:employeeId/emergency-contacts', employeeEmergencyContactRoutes);
app.use('/api/employees/:employeeId/welfare-info', employeeWelfareInfoRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/employee-notes', employeeNoteRoutes);
app.use('/api/communications', communicationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/work-logs', workLogRoutes);
app.use('/api/groups', groupRoutes);

// Backward-compatible mounts without the /api prefix (legacy routes only -
// the modules above were introduced alongside these mounts and have no
// existing non-prefixed callers, so they're intentionally not duplicated here)
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/leaves', leaveRoutes);
app.use('/leave-calendar', leaveCalendarRoutes);
app.use('/salary', salaryRoutes);
app.use('/reports', reportRoutes);
app.use('/facilities', facilityRoutes);
app.use('/medical-insurance', medicalInsuranceRoutes);
app.use('/consultant-submissions', consultantSubmissionRoutes);
app.use('/vouchers', voucherRoutes);
app.use('/vendors', vendorRoutes);
app.use('/permissions', permissionRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Database connectivity check
app.get(['/api/db-health', '/db-health'], async (_req, res) => {
  const resolvedDbPassword = String(env.DB_PASSWORD ?? '');
  const hasResolvedDbPassword = resolvedDbPassword.trim().length > 0;
  const resolveDbPasswordSource = (): 'env-var' | 'file' | 'none' => {
    if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim().length > 0) {
      return 'env-var';
    }
    if (process.env.DB_PASSWORD_FILE) {
      return 'file';
    }
    return 'none';
  };
  const dbPasswordSource = resolveDbPasswordSource();

  try {
    const dbCheck = await pool.query(
      `
      SELECT
        current_database() AS database_name,
        current_schema() AS schema_name,
        current_user AS db_user,
        now() AS server_time,
        EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1
        ) AS has_tables_in_schema
      `,
      [env.DB_SCHEMA],
    );

    res.status(200).json({
      success: true,
      message: 'Database connectivity is healthy',
      connection: {
        mode: env.CLOUD_SQL_CONNECTION_NAME ? 'cloud-sql-socket' : 'tcp',
        configuredSchema: env.DB_SCHEMA,
        cloudSqlConnectionName: env.CLOUD_SQL_CONNECTION_NAME ?? null,
        dbPasswordConfigured: hasResolvedDbPassword,
        dbPasswordType: typeof env.DB_PASSWORD,
        dbPasswordSource,
      },
      database: dbCheck.rows[0],
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Database health check failed');
    res.status(500).json({
      success: false,
      message: 'Database connectivity failed',
      error: error.message,
      connection: {
        mode: env.CLOUD_SQL_CONNECTION_NAME ? 'cloud-sql-socket' : 'tcp',
        configuredSchema: env.DB_SCHEMA,
        dbPasswordConfigured: hasResolvedDbPassword,
        dbPasswordType: typeof env.DB_PASSWORD,
        dbPasswordSource,
      },
    });
  }
});

// CORS diagnostic
app.get(['/api/cors-check', '/cors-check'], (req, res) => {
  const origin = req.headers.origin;
  const isAllowed = !!origin && allowedOrigins.includes(origin);
  res.json({
    success: true,
    cors: {
      requestOrigin: origin || 'no origin header',
      allowedOrigins,
      isOriginAllowed: isAllowed,
      frontendUrl: env.FRONTEND_URL ?? 'not set',
      nodeEnv: env.NODE_ENV,
    },
  });
});

// Email configuration diagnostic
app.get(['/api/email-config-check', '/email-config-check'], (_req, res) => {
  res.json({
    success: true,
    message: 'SMTP Email Diagnostic Endpoint',
    config: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER ?? 'not set',
      from: env.SMTP_FROM ?? 'not set',
      nodeEnv: env.NODE_ENV,
    },
    troubleshooting: [
      'Ensure SMTP_HOST is correct (e.g. your outgoing mail server)',
      'Ensure SMTP_PORT is correct (e.g. 465 for SSL/TLS, 587 for STARTTLS)',
      'Verify SMTP_USER and SMTP_PASS are correctly configured in .env',
      'Check mail server SMTP logs if emails are not arriving',
    ],
  });
});

app.get(['/api/test-email', '/test-email'], (_req, res) => {
  res.json({
    success: true,
    message:
      'Test email endpoint is available. Use POST method to send emails.',
    usage: 'POST /api/test-email { "email": "your-email@example.com" }',
  });
});

app.post('/api/test-email', async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    const testEmail = email || 'info@oxocareers.com';
    const emailSubject = subject || '🧪 SMTP Test Email';

    const { sendEmail } = await import('./config/email');

    const params = {
      message:
        message ||
        'This is a test email to verify SMTP configuration is working correctly.',
      timestamp: new Date().toISOString(),
      to_email: testEmail,
    };

    const result = await sendEmail(testEmail, emailSubject, params);

    if (result) {
      res.json({
        success: true,
        message: `Test email sent successfully via SMTP to ${testEmail}`,
        status: result.status,
      });
    } else {
      res.status(500).json({
        success: false,
        message:
          'Failed to send test email via SMTP. Check server logs for details.',
        hint: 'Make sure SMTP variables are set in .env',
      });
    }
  } catch (error: any) {
    req.log.error({ err: error }, 'Test email failed');
    res.status(500).json({
      success: false,
      message: 'Error sending test email',
      error: error.message,
    });
  }
});

// 404 handler — must be after all routes
app.use((req, res) => {
  req.log.warn({ path: req.url, method: req.method }, 'Route not found');
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.url,
    method: req.method,
    availableEndpoints: [
      'GET /health',
      'GET /api/cors-check',
      'GET /api/email-config-check',
      'GET /api/test-email',
      'POST /api/test-email',
      'POST /api/auth/login',
      'GET /api/users',
      'GET /api/leaves',
      'GET /api/leave-calendar',
      'GET /api/salary',
      'GET /api/reports',
      'GET /api/facilities',
      'GET /api/medical-insurance',
      'GET /api/medical-insurance/limits',
      'GET /api/consultant-submissions',
      'GET /api/vouchers',
      'GET /api/vendors',
      'GET /api/profile-change-requests',
      'GET /api/employee-education',
      'GET /api/employee-work-history',
      'GET /api/notifications',
      'GET /api/employee-pii/:userId',
      'GET /api/employees/:employeeId/nominees',
      'GET /api/employees/:employeeId/dependents',
      'GET /api/employees/:employeeId/emergency-contacts',
      'GET /api/employees/:employeeId/welfare-info',
      'POST /api/employee-notes',
      'GET /api/employee-notes/employee/:employeeUserId',
      'GET /api/communications',
      'GET /api/communications/mine',
      'GET /api/events',
      'GET /api/forms',
      'GET /api/forms/mine',
      'GET /api/work-logs/mine',
    ],
  });
});

// Global error handler — must be the last middleware
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    app.listen(PORT, async () => {
      logger.info({ port: PORT, database: env.DB_NAME }, 'Server started');
      logger.info(
        'Email endpoints: GET/POST /api/test-email, GET /api/email-config-check',
      );

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
            logger.info('🌱 Database tbl_leave_types table is empty. Inserting default leave types...');
            await pool.query(`
              INSERT INTO tbl_leave_types (name, description, max_days, is_active) VALUES
              ('Annual Leave', 'Annual paid leave', 21, true),
              ('Sick Leave', 'Medical sick leave', 14, true),
              ('Casual Leave', 'Short notice casual leave', 7, true)
            `);
            logger.info('✅ Default leave types inserted successfully.');
          }
        } catch (seedError: any) {
          logger.error({ err: seedError }, 'Failed to self-seed default leave types on startup');
        }

        // 2. Initialize missing leave balances for existing employees
        try {
          logger.info('⚙️ Checking leave balances for existing employees...');
          const employeesRes = await pool.query("SELECT id, hire_date FROM tbl_employee WHERE role = 'employee'");
          const employees = employeesRes.rows || [];

          const leaveTypesRes = await pool.query("SELECT id, name, max_days FROM tbl_leave_types WHERE is_active = true");
          const leaveTypes = leaveTypesRes.rows || [];

          const currentYear = new Date().getFullYear();
          let initializedBalancesCount = 0;

          for (const emp of employees) {
            for (const type of leaveTypes) {
              const checkRes = await pool.query(
                'SELECT 1 FROM tbl_employee_leave_balance WHERE user_id = $1 AND leave_type_id = $2 AND year = $3',
                [emp.id, type.id, currentYear]
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
                  [emp.id, type.id, totalDays, currentYear]
                );
                initializedBalancesCount++;
              }
            }
          }
          if (initializedBalancesCount > 0) {
            logger.info(`✅ Initialized ${initializedBalancesCount} missing leave balance records for existing employees.`);
          } else {
            logger.info('✅ All employee leave balances are up to date.');
          }
        } catch (balanceError: any) {
          logger.error({ err: balanceError }, 'Failed to check/initialize employee leave balances on startup');
        }

        // 3. Assign default permissions to existing employee accounts if they don't already have them
        try {
          logger.info('⚙️ Checking default permissions for existing employees...');
          const employeesRes = await pool.query("SELECT id FROM tbl_employee WHERE role = 'employee'");
          const employeeIds = (employeesRes.rows || []).map((row: any) => row.id);
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
                'SELECT 1 FROM tbl_user_permissions WHERE user_id = $1 AND permission_key = $2',
                [empId, permission]
              );
              if (checkRes.rows.length === 0) {
                await pool.query(
                  'INSERT INTO tbl_user_permissions (user_id, permission_key, access_level) VALUES ($1, $2, $3)',
                  [empId, permission, 'read']
                );
                assignedCount++;
              }
            }
          }
          if (assignedCount > 0) {
            logger.info(`✅ Assigned ${assignedCount} missing default permissions to employees in Postgres.`);
          } else {
            logger.info('✅ All employee permissions are up to date in Postgres.');
          }
        } catch (syncError: any) {
          logger.error({ err: syncError }, 'Failed to check/assign default employee permissions on startup');
        }

        // 4. Grant HR managers/executives write access to Profile Change Requests
        // so the "Profile Approvals" nav item appears immediately post-deploy,
        // without anyone needing to visit the Permissions admin screen first.
        try {
          logger.info('⚙️ Checking profile_change_requests permission for HR users...');
          const hrRes = await pool.query(
            "SELECT id FROM tbl_employee WHERE role IN ('hr_manager', 'hr_executive')"
          );
          const hrIds = (hrRes.rows || []).map((row: any) => row.id);
          let hrAssignedCount = 0;
          for (const hrId of hrIds) {
            const checkRes = await pool.query(
              'SELECT access_level FROM tbl_user_permissions WHERE user_id = $1 AND permission_key = $2',
              [hrId, 'profile_change_requests']
            );
            if (checkRes.rows.length === 0) {
              await pool.query(
                'INSERT INTO tbl_user_permissions (user_id, permission_key, access_level) VALUES ($1, $2, $3)',
                [hrId, 'profile_change_requests', 'write']
              );
              hrAssignedCount++;
            } else if (checkRes.rows[0].access_level !== 'write') {
              await pool.query(
                'UPDATE tbl_user_permissions SET access_level = $3 WHERE user_id = $1 AND permission_key = $2',
                [hrId, 'profile_change_requests', 'write']
              );
              hrAssignedCount++;
            }
          }
          if (hrAssignedCount > 0) {
            logger.info(`✅ Granted/updated profile_change_requests (write) for ${hrAssignedCount} HR users.`);
          } else {
            logger.info('✅ All HR users already have profile_change_requests (write).');
          }
        } catch (hrPermError: any) {
          logger.error({ err: hrPermError }, 'Failed to check/assign HR profile_change_requests permission on startup');
        }

        // 5. Grant HR managers/executives write access to Communications, Events
        // and Forms, and HR managers write access to Work Logs, so those nav
        // items appear immediately post-deploy without a manual admin step.
        try {
          logger.info('⚙️ Checking HR modules permissions for HR users...');
          const hrRes = await pool.query(
            "SELECT id, role FROM tbl_employee WHERE role IN ('hr_manager', 'hr_executive')"
          );
          const grants: { userId: number; key: string }[] = [];
          for (const row of hrRes.rows as any[]) {
            for (const key of ['communications', 'events', 'forms']) {
              grants.push({ userId: row.id, key });
            }
            if (row.role === 'hr_manager') {
              grants.push({ userId: row.id, key: 'work_logs' });
            }
          }
          let hrModuleGrantCount = 0;
          for (const grant of grants) {
            const checkRes = await pool.query(
              'SELECT access_level FROM tbl_user_permissions WHERE user_id = $1 AND permission_key = $2',
              [grant.userId, grant.key]
            );
            if (checkRes.rows.length === 0) {
              await pool.query(
                'INSERT INTO tbl_user_permissions (user_id, permission_key, access_level) VALUES ($1, $2, $3)',
                [grant.userId, grant.key, 'write']
              );
              hrModuleGrantCount++;
            } else if (checkRes.rows[0].access_level !== 'write') {
              await pool.query(
                'UPDATE tbl_user_permissions SET access_level = $3 WHERE user_id = $1 AND permission_key = $2',
                [grant.userId, grant.key, 'write']
              );
              hrModuleGrantCount++;
            }
          }
          if (hrModuleGrantCount > 0) {
            logger.info(`✅ Granted/updated HR modules permissions for ${hrModuleGrantCount} assignments.`);
          } else {
            logger.info('✅ All HR users already have HR modules permissions.');
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
          logger.info(
            { host: status.smtp.host, user: status.smtp.user },
            'Email (SMTP) configuration ready',
          );
        } else {
          logger.error(
            'Email (SMTP) not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env',
          );
        }
      } catch (error: any) {
        logger.error({ err: error }, 'Could not check email configuration');
      }
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
