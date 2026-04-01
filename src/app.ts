import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables - try multiple paths for production compatibility
const loadEnv = () => {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),           // Most common location
    path.resolve(__dirname, '../.env'),           // From dist/app.js
    path.resolve(__dirname, '../../.env'),        // Alternative path
  ];

  // Try each path
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath, override: false });
      if (!result.error) {
        console.log(`[App] ✅ Loaded .env from: ${envPath}`);
        return;
      }
    }
  }

  // Fallback to default (won't override existing process.env)
  dotenv.config({ override: false });
  console.log(`[App] ℹ️  Using process.env variables (no .env file found)`);
};

loadEnv();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeDatabase } from './config/initDatabase';
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
const app = express();
const PORT = process.env.PORT || 5000;

// CORS Configuration - Must be before other middleware
const allowedOrigins = [
  'https://app.oxocareers.com',
  'http://localhost:3000',
  'http://localhost:5173  ',
  process.env.FRONTEND_URL
].filter(Boolean); // Remove undefined values

// Log CORS configuration on startup
console.log('[CORS] 🔧 CORS Configuration:');
console.log(`[CORS]    Allowed origins: ${allowedOrigins.join(', ')}`);
console.log(`[CORS]    NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`[CORS]    FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set'}`);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl, server-to-server)
    if (!origin) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[CORS] ✅ Allowing request with no origin');
      }
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[CORS] ✅ Allowing origin: ${origin}`);
      }
      callback(null, true);
    } else {
      // In production, be strict. In development, allow localhost
      if (process.env.NODE_ENV === 'production') {
        console.error(`[CORS] ❌ Blocked origin: ${origin}`);
        console.error(`[CORS]    Allowed origins: ${allowedOrigins.join(', ')}`);
        console.error(`[CORS]    FRONTEND_URL env: ${process.env.FRONTEND_URL || 'not set'}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      } else {
        // In development, allow any localhost
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          console.log(`[CORS] ✅ Allowing localhost origin: ${origin}`);
          callback(null, true);
        } else {
          console.warn(`[CORS] ❌ Blocked origin: ${origin}`);
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      }
    }
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
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
}));

// Handle preflight OPTIONS requests explicitly (critical for CORS)
// Use middleware approach instead of wildcard route (compatible with newer path-to-regexp)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin as string | undefined;
    
    // Check if origin is allowed
    const isAllowed = origin && allowedOrigins.includes(origin);
    
    if (isAllowed || !origin) {
      if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
      } else {
        res.header('Access-Control-Allow-Origin', '*');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400');
      res.sendStatus(204);
    } else {
      res.status(403).json({ error: 'CORS policy: Origin not allowed' });
    }
  } else {
    next();
  }
});

// Configure Helmet to work with CORS (must be after CORS)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Request Logger
app.use((req, res, next) => {
  console.log(`[Server] 📨 ${req.method} ${req.url}`);
  next();
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
// Mount routes with /api prefix (primary)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/leave-calendar', leaveCalendarRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/medical-insurance', medicalInsuranceRoutes); // GET /, GET /limits, GET /:id, POST /, etc.
app.use('/api/consultant-submissions', consultantSubmissionRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/vendors', vendorRoutes);

// Also mount routes without /api prefix for backward compatibility
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

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Diagnostic and test endpoints (Moved up to ensure they are always reachable)
// CORS diagnostic endpoint
app.get(['/api/cors-check', '/cors-check'], (req, res) => {
  const origin = req.headers.origin;
  const isAllowed = origin && allowedOrigins.includes(origin);
  
  res.json({
    success: true,
    cors: {
      requestOrigin: origin || 'no origin header',
      allowedOrigins: allowedOrigins,
      isOriginAllowed: isAllowed,
      frontendUrl: process.env.FRONTEND_URL || 'not set',
      nodeEnv: process.env.NODE_ENV || 'not set'
    }
  });
});

// Email configuration diagnostic endpoint
app.get(['/api/email-config-check', '/email-config-check'], (req, res) => {
  const serviceId = process.env.EMAILJS_SERVICE_ID || 'not set';
  const templateId = process.env.EMAILJS_TEMPLATE_ID || 'not set';
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || 'not set';
  const privateKey = process.env.EMAILJS_PRIVATE_KEY ? '✓ SET (masked)' : '✗ MISSING';
  
  res.json({
    success: true,
    message: 'EmailJS Diagnostic Endpoint',
    config: {
      serviceId,
      templateId,
      publicKey,
      privateKeyStatus: privateKey,
      nodeEnv: process.env.NODE_ENV || 'development'
    },
    troubleshooting: [
      "Ensure EMAILJS_SERVICE_ID is correct from your dashboard",
      "Ensure EMAILJS_PUBLIC_KEY and EMAILJS_PRIVATE_KEY are correctly set",
      "Check EmailJS dashboard logs if emails are not arriving"
    ]
  });
});


// Quick Test email endpoint
app.get(['/api/test-email', '/test-email'], (req, res) => {
  res.json({
    success: true,
    message: 'Test email endpoint is available. Use POST method to send emails.',
    usage: 'POST /api/test-email { "email": "your-email@example.com" }'
  });
});

// POST endpoint for sending test emails (using EmailJS)
app.post('/api/test-email', async (req, res) => {
  try {
    const { email, subject, message, templateId } = req.body;
    const testEmail = email || 'info@oxocareers.com';
    const emailSubject = subject || '🧪 EmailJS Test Email';
    
    // Default: use the existing sendEmail function from email config
    const { sendEmail } = await import('./config/email');
    
    const params = {
      message: message || 'This is a test email to verify EmailJS configuration is working correctly.',
      timestamp: new Date().toISOString(),
      to_email: testEmail
    };

    const result = await sendEmail(testEmail, emailSubject, params, templateId);

    if (result) {
      res.json({
        success: true,
        message: `Test email sent successfully via EmailJS to ${testEmail}`,
        status: result.status
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test email via EmailJS. Check server logs for details.',
        hint: 'Make sure EMAILJS keys are set in .env'
      });
    }
  } catch (error: any) {
    console.error('[TestEmail] ❌ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending test email',
      error: error.message
    });
  }
});


// 404 handler for undefined routes (must be after all routes)
app.use((req, res) => {
  console.log(`[404] Route not found: ${req.method} ${req.url}`);
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
    ]
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Start server
    app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Database: ${process.env.DB_NAME || 'hris_payroll'}`);
      console.log(`📧 Email endpoints registered:`);
      console.log(`   GET  /api/test-email - Check endpoint availability`);
      console.log(`   POST /api/test-email - Send test email`);
      console.log(`   GET  /api/email-config-check - Check email configuration`);
      
      // Check email configuration on startup
      try {
        const { getEmailServiceStatus } = await import('./config/email');
        const status = getEmailServiceStatus();
        if (status.overall) {
          console.log(`📧 Email Configuration (EmailJS): ✅ Ready`);
          console.log(`   Service ID: ${status.emailJS.serviceId}`);
        } else {
          console.error(`📧 Email Configuration (EmailJS): ❌ NOT CONFIGURED`);
          console.error(`   Set EMAILJS_SERVICE_ID, PUBLIC_KEY, and PRIVATE_KEY in .env`);
        }
      } catch (error: any) {
        console.error(`📧 Email Configuration: ⚠️  Could not check configuration: ${error.message}`);
      }

    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();