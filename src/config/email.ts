import nodemailer from 'nodemailer';
import { env } from './env';
import { logger as baseLogger } from '../lib/logger';
import {
  getSetupPasswordEmailHtml,
  getPasswordResetEmailHtml,
  getEmailVerificationEmailHtml,
  getWelcomeCredentialsEmailHtml,
  AuthEmailParams
} from '../templates/authTemplates';
import {
  getLeaveSubmittedEmailHtml,
  getLeaveApprovedEmailHtml,
  getLeaveRejectedEmailHtml,
  LeaveEmailParams
} from '../templates/leaveTemplates';
import {
  getMedicalClaimSubmittedHtml,
  getMedicalClaimApprovedHtml,
  getMedicalClaimRejectedHtml,
  MedicalEmailParams
} from '../templates/medicalTemplates';
import {
  getPayslipAvailableHtml,
  PayslipEmailParams
} from '../templates/payslipTemplate';
import {
  getVoucherApprovedHtml,
  getVoucherRejectedHtml,
  VoucherEmailParams
} from '../templates/voucherTemplates';

const log = baseLogger.child({ module: 'email' });

const FRONTEND_FALLBACK = 'https://oxo-carriers-frontend-297614602590.us-central1.run.app';

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

/**
 * Sends a pre-rendered HTML email to a recipient.
 */
export const sendHtmlEmail = async (
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<any> => {
  const transporter = getTransporter();
  if (!transporter) {
    log.error('Email configuration incomplete — SMTP transporter could not be initialized');
    return null;
  }

  const from = env.SMTP_FROM || `"OXO Carriers" <${env.SMTP_USER}>`;
  const plainText = text || subject;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: plainText,
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

/**
 * Main email sending function using SMTP (nodemailer).
 * Modernized to use the premium corporate layouts.
 */
export const sendEmail = async (
  to: string,
  subject: string,
  templateParams: any,
): Promise<any> => {
  const name = templateParams.firstName || templateParams.name || 'User';
  let html = '';

  if (templateParams.setupLink) {
    // Onboarding / Setup Password template
    html = getSetupPasswordEmailHtml({
      name,
      employeeId: templateParams.employeeId,
      setupLink: templateParams.setupLink,
      button_text: templateParams.button_text,
      expiry: templateParams.expiry,
      message_body: templateParams.message_body,
    });
  } else if (templateParams.resetLink) {
    // Password Reset template
    html = getPasswordResetEmailHtml({
      name,
      resetLink: templateParams.resetLink,
      button_text: templateParams.button_text,
      expiry: templateParams.expiry,
      message_body: templateParams.message_body,
    });
  } else if (templateParams.verificationLink) {
    // Email Verification template
    html = getEmailVerificationEmailHtml({
      name,
      verificationLink: templateParams.verificationLink,
      expiry: templateParams.expiry,
    });
  } else if (templateParams.password) {
    // Welcome / Credentials template
    html = getWelcomeCredentialsEmailHtml({
      name,
      employeeId: templateParams.employeeId,
      password: templateParams.password,
      loginUrl: templateParams.loginUrl,
      button_text: templateParams.button_text,
      message_body: templateParams.message_body,
    });
  } else {
    // Fallback template
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7ec; border-radius: 8px;">
        <h2 style="color: #101828;">Notification</h2>
        <p>Hello ${name},</p>
        <p>${templateParams.message || templateParams.message_body || 'Notification from OXO Carriers Portal'}</p>
        <br>
        <p style="color: #667085; font-size: 12px;">Sent: ${new Date().toLocaleString()}</p>
      </div>
    `;
  }

  const text = templateParams.message || templateParams.message_body || subject;
  return sendHtmlEmail(to, subject, html, text);
};

// ─── Template helpers ─────────────────────────────────────────────────────

export const sendEmployeeCredentials = async (
  email: string,
  employeeId: string,
  password: string,
  firstName: string,
) => {
  const subject = 'Welcome to OXO Carriers - Your Login Credentials';
  const params = {
    firstName,
    employeeId,
    email,
    password,
    message_body:
      'Your account for the OXO Carriers Portal has been successfully created. Please use the temporary credentials below to access your portal.',
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
  const subject = 'Set Up Your Password - OXO Carriers';
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
  const subject = 'Password Reset - OXO Carriers';
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
  const subject = 'Verify Your Email Address - OXO Carriers';
  const frontendUrl = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

  const params = {
    firstName,
    verificationLink,
    expiry: '24 hours',
  };

  return sendEmail(email, subject, params);
};

// ─── Leave management email helpers ───────────────────────────────────────────

export const sendLeaveSubmittedEmail = async (email: string, params: LeaveEmailParams) => {
  const html = getLeaveSubmittedEmailHtml(params);
  const subject = `Leave Request Submitted - ${params.referenceNumber}`;
  return sendHtmlEmail(email, subject, html);
};

export const sendLeaveApprovedEmail = async (email: string, params: LeaveEmailParams) => {
  const html = getLeaveApprovedEmailHtml(params);
  const subject = `Leave Request Approved - ${params.referenceNumber}`;
  return sendHtmlEmail(email, subject, html);
};

export const sendLeaveRejectedEmail = async (email: string, params: LeaveEmailParams) => {
  const html = getLeaveRejectedEmailHtml(params);
  const subject = `Leave Request Declined - ${params.referenceNumber}`;
  return sendHtmlEmail(email, subject, html);
};

// ─── Medical claims email helpers ─────────────────────────────────────────────

export const sendMedicalClaimSubmittedEmail = async (email: string, params: MedicalEmailParams) => {
  const html = getMedicalClaimSubmittedHtml(params);
  const subject = `Medical Claim Submitted - ${params.claimId}`;
  return sendHtmlEmail(email, subject, html);
};

export const sendMedicalClaimApprovedEmail = async (email: string, params: MedicalEmailParams) => {
  const html = getMedicalClaimApprovedHtml(params);
  const subject = `Medical Claim Approved - ${params.claimId}`;
  return sendHtmlEmail(email, subject, html);
};

export const sendMedicalClaimRejectedEmail = async (email: string, params: MedicalEmailParams) => {
  const html = getMedicalClaimRejectedHtml(params);
  const subject = `Medical Claim Rejected - ${params.claimId}`;
  return sendHtmlEmail(email, subject, html);
};

// ─── Salary payslip email helpers ─────────────────────────────────────────────

export const sendPayslipAvailableEmail = async (email: string, params: PayslipEmailParams) => {
  const html = getPayslipAvailableHtml(params);
  const subject = `Salary Payslip Available - Period ${params.payPeriod}`;
  return sendHtmlEmail(email, subject, html);
};

// ─── Voucher email helpers ────────────────────────────────────────────────────

export const sendVoucherApprovedEmail = async (email: string, params: VoucherEmailParams) => {
  const html = getVoucherApprovedHtml(params);
  const subject = `Voucher Approved - ${params.voucherNumber || ''}`;
  return sendHtmlEmail(email, subject, html);
};

export const sendVoucherRejectedEmail = async (email: string, params: VoucherEmailParams) => {
  const html = getVoucherRejectedHtml(params);
  const subject = `Voucher Request Rejected`;
  return sendHtmlEmail(email, subject, html);
};

// ─── Diagnostic helpers ───────────────────────────────────────────────────────

export const sendTestEmail = async (
  to: string = '',
): Promise<{ success: boolean; message: string; details?: any }> => {
  const testEmail = to || 'info@oxocareers.com';
  const subject = 'Test Email from OXO Carriers (SMTP)';

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
