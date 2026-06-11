import nodemailer from 'nodemailer';
import { env } from './env';
import { logger as baseLogger } from '../lib/logger';

const log = baseLogger.child({ module: 'email' });

const FRONTEND_FALLBACK = 'https://app.oxocareers.com';

const getTransporter = () => {
  let host = env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = env.SMTP_PORT || 587;
  const secure = env.SMTP_SECURE;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  if (!user || !pass) {
    log.error('SMTP credentials missing');
    return null;
  }

  let tlsOptions: any = {
    rejectUnauthorized: false, // helps with self-signed certs common in hosting environments
  };

  // Workaround for Node.js DNS resolution issues on this host
  if (host === 'smtp-relay.brevo.com') {
    host = '1.179.116.1';
    tlsOptions.servername = 'smtp-relay.brevo.com';
  }

  return nodemailer.createTransport({
    host,
    port,
    secure, // true for port 465, false for 587
    auth: {
      user,
      pass,
    },
    tls: tlsOptions,
  });
};

// Main email sending function using SMTP (nodemailer)
export const sendEmail = async (
  to: string,
  subject: string,
  templateParams: any,
): Promise<any> => {
  const transporter = getTransporter();
  if (!transporter) {
    log.error(
      'Email configuration incomplete — SMTP transporter could not be initialized',
    );
    return null;
  }

  const from = env.SMTP_FROM || `"OXO Careers" <${env.SMTP_USER}>`;

  // Construct clean HTML layout depending on the context of parameters provided
  let html = '';
  const name = templateParams.firstName || templateParams.name || 'User';

  if (templateParams.setupLink) {
    // Onboarding / Setup Password template
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7ec; border-radius: 8px;">
        <h2 style="color: #101828;">Set Up Your Password</h2>
        <p>Hello ${name},</p>
        <p>${templateParams.message_body || 'We are excited to have you on board! To get started, please use the button below to set up your secure account password.'}</p>
        <p><strong>Employee ID:</strong> ${templateParams.employeeId || ''}</p>
        <br>
        <p style="text-align: center;">
          <a href="${templateParams.setupLink}" style="background-color: #465FFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            ${templateParams.button_text || 'Complete Password Setup'}
          </a>
        </p>
        <br>
        <p style="color: #667085; font-size: 12px;">Note: This link expires in ${templateParams.expiry || '7 days'}.</p>
      </div>
    `;
  } else if (templateParams.resetLink) {
    // Password Reset template
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7ec; border-radius: 8px;">
        <h2 style="color: #101828;">Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>${templateParams.message_body || 'We received a request to reset your password. If you did not make this request, you can safely ignore this email.'}</p>
        <br>
        <p style="text-align: center;">
          <a href="${templateParams.resetLink}" style="background-color: #465FFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            ${templateParams.button_text || 'Reset My Password'}
          </a>
        </p>
        <br>
        <p style="color: #667085; font-size: 12px;">Note: This link expires in ${templateParams.expiry || '1 hour'}.</p>
      </div>
    `;
  } else if (templateParams.verificationLink) {
    // Email Verification template
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7ec; border-radius: 8px;">
        <h2 style="color: #101828;">Verify Your Email Address</h2>
        <p>Hello ${name},</p>
        <p>To verify your email address and activate your account, please click the button below:</p>
        <br>
        <p style="text-align: center;">
          <a href="${templateParams.verificationLink}" style="background-color: #465FFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Verify Email
          </a>
        </p>
        <br>
        <p style="color: #667085; font-size: 12px;">Note: This link expires in ${templateParams.expiry || '24 hours'}.</p>
      </div>
    `;
  } else if (templateParams.password) {
    // Welcome / Credentials template
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7ec; border-radius: 8px;">
        <h2 style="color: #101828;">Welcome to HRIS Portal</h2>
        <p>Hello ${name},</p>
        <p>${templateParams.message_body || 'Your account has been successfully created. Please use the credentials below to log in:'}</p>
        <p><strong>Employee ID:</strong> ${templateParams.employeeId || ''}</p>
        <p><strong>Email/Username:</strong> ${to || ''}</p>
        <p><strong>Temporary Password:</strong> ${templateParams.password}</p>
        <br>
        <p style="text-align: center;">
          <a href="${templateParams.loginUrl || '#'}" style="background-color: #465FFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            ${templateParams.button_text || 'Go to Login Portal'}
          </a>
        </p>
      </div>
    `;
  } else {
    // Generic text/html template fallback
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7ec; border-radius: 8px;">
        <h2 style="color: #101828;">Notification</h2>
        <p>Hello ${name},</p>
        <p>${templateParams.message || templateParams.message_body || 'Notification from HRIS Payroll System'}</p>
        <br>
        <p style="color: #667085; font-size: 12px;">Sent: ${new Date().toLocaleString()}</p>
      </div>
    `;
  }

  const text = templateParams.message || templateParams.message_body || subject;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    log.info({ to, messageId: info.messageId }, 'Email sent successfully via SMTP');
    return {
      service: 'smtp',
      response: info,
      status: 200,
      success: true,
    };
  } catch (error: any) {
    log.error({ err: error, to }, 'SMTP send failed');
    return null;
  }
};

// ─── Template helpers ─────────────────────────────────────────────────────

export const sendEmployeeCredentials = async (
  email: string,
  employeeId: string,
  password: string,
  firstName: string,
) => {
  const subject = 'Welcome to HRIS Payroll System - Your Login Credentials';
  const params = {
    firstName,
    employeeId,
    email,
    password,
    message_body:
      'Your account for the HRIS Payroll System has been successfully created. Please use the temporary credentials below to access your portal.',
    button_text: 'Go to Login Portal',
    loginUrl: env.FRONTEND_URL ?? FRONTEND_FALLBACK,
  };

  return sendEmail(email, subject, params);
};

export const sendPasswordSetupEmail = async (
  email: string,
  setupToken: string,
  firstName: string,
  employeeId: string,
) => {
  const subject = 'Set Up Your Password - HRIS Payroll System';
  const setupLink = `${env.FRONTEND_URL ?? FRONTEND_FALLBACK}/reset-password?token=${setupToken}`;

  const params = {
    firstName,
    employeeId,
    setupLink,
    expiry: '7 days',
    message_body:
      'We are excited to have you on board! To get started, please use the button below to set up your secure account password.',
    button_text: 'Complete Password Setup',
  };

  return sendEmail(email, subject, params);
};

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  firstName: string,
) => {
  const subject = 'Password Reset - HRIS Payroll System';
  const resetLink = `${env.FRONTEND_URL ?? FRONTEND_FALLBACK}/reset-password?token=${resetToken}`;

  const params = {
    firstName,
    resetLink,
    expiry: '1 hour',
    message_body:
      'We received a request to reset your password. If you did not make this request, you can safely ignore this email.',
    button_text: 'Reset My Password',
  };

  return sendEmail(email, subject, params);
};

export const sendEmailVerificationEmail = async (
  email: string,
  verificationToken: string,
  firstName: string,
) => {
  const subject = 'Verify Your Email Address - HRIS Payroll System';
  const frontendUrl = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

  const params = {
    firstName,
    verificationLink,
    expiry: '24 hours',
  };

  return sendEmail(email, subject, params);
};

export const sendTestEmail = async (
  to: string = '',
): Promise<{ success: boolean; message: string; details?: any }> => {
  const testEmail = to || 'info@oxocareers.com';
  const subject = 'Test Email from HRIS System (SMTP)';

  const params = {
    message: 'This is a test email to verify your SMTP configuration.',
    timestamp: new Date().toISOString(),
  };

  try {
    const result = await sendEmail(testEmail, subject, params);

    if (result) {
      return {
        success: true,
        message: `Test email sent successfully via SMTP`,
        details: result,
      };
    }
    return {
      success: false,
      message: 'Failed to send test email via SMTP. Check logs.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error sending test email: ${error.message}`,
    };
  }
};

export const getEmailServiceStatus = () => {
  const ready = !!(
    env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    env.SMTP_PASS
  );
  return {
    smtp: {
      ready,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      secure: env.SMTP_SECURE,
    },
    overall: ready,
  };
};

// Startup status report
(async () => {
  const status = getEmailServiceStatus();
  log.info(
    { ready: status.overall, user: status.smtp.user ?? null },
    `Startup email status: ${status.overall ? 'ready' : 'not configured'}`,
  );
})();

export const verifyEmailConfigOnStartup = async () =>
  !!(env.SMTP_USER && env.SMTP_PASS);
