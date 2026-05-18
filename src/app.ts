// Load + validate env first. Side effects of importing env.ts:
//   1. Reads .env from project root (or container env vars).
//   2. Validates with Zod and exits on failure.
// All other imports below see a fully populated, typed `env`.
import { env, ENV_LOADED_FROM } from './config/env';
import { logger } from './lib/logger';

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

if (ENV_LOADED_FROM) {
  logger.info({ envFile: ENV_LOADED_FROM }, 'Loaded environment from file');
} else {
  logger.info('No .env file found; using process.env values');
}

const app = express();
const PORT = env.PORT;

// ─── CORS ────────────────────────────────────────────────────────────────
const normalizeOrigin = (origin?: string | null): string => {
  if (!origin) return '';
  return origin.trim().replace(/\/$/, '').toLowerCase();
};

const rawAllowedOrigins = [
  'https://app.oxocareers.com',
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

// Backward-compatible mounts without the /api prefix
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
    message: 'EmailJS Diagnostic Endpoint',
    config: {
      serviceId: env.EMAILJS_SERVICE_ID ?? 'not set',
      templateId: env.EMAILJS_TEMPLATE_ID ?? 'not set',
      publicKey: env.EMAILJS_PUBLIC_KEY ?? 'not set',
      privateKeyStatus: env.EMAILJS_PRIVATE_KEY ? '✓ SET (masked)' : '✗ MISSING',
      nodeEnv: env.NODE_ENV,
    },
    troubleshooting: [
      'Ensure EMAILJS_SERVICE_ID is correct from your dashboard',
      'Ensure EMAILJS_PUBLIC_KEY and EMAILJS_PRIVATE_KEY are correctly set',
      'Check EmailJS dashboard logs if emails are not arriving',
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
    const { email, subject, message, templateId } = req.body;
    const testEmail = email || 'info@oxocareers.com';
    const emailSubject = subject || '🧪 EmailJS Test Email';

    const { sendEmail } = await import('./config/email');

    const params = {
      message:
        message ||
        'This is a test email to verify EmailJS configuration is working correctly.',
      timestamp: new Date().toISOString(),
      to_email: testEmail,
    };

    const result = await sendEmail(testEmail, emailSubject, params, templateId);

    if (result) {
      res.json({
        success: true,
        message: `Test email sent successfully via EmailJS to ${testEmail}`,
        status: result.status,
      });
    } else {
      res.status(500).json({
        success: false,
        message:
          'Failed to send test email via EmailJS. Check server logs for details.',
        hint: 'Make sure EMAILJS keys are set in .env',
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

      try {
        const { getEmailServiceStatus } = await import('./config/email');
        const status = getEmailServiceStatus();
        if (status.overall) {
          logger.info(
            { serviceId: status.emailJS.serviceId },
            'Email (EmailJS) configuration ready',
          );
        } else {
          logger.error(
            'Email (EmailJS) not configured — set EMAILJS_SERVICE_ID, PUBLIC_KEY, PRIVATE_KEY in .env',
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
