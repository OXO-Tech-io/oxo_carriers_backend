import nodemailer from 'nodemailer';
import { env } from './env';
import { logger as baseLogger } from '../lib/logger';
import {
  getSetupPasswordEmailHtml,
  getPasswordResetEmailHtml,
  getEmailVerificationEmailHtml,
  getWelcomeCredentialsEmailHtml,
  getPasswordResetCredentialsEmailHtml,
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
import {
  getProfileChangeSubmittedEmailHtml,
  getProfileChangeApprovedEmailHtml,
  getProfileChangeRejectedEmailHtml,
  getProfileChangeReturnedEmailHtml,
  ProfileChangeEmailParams
} from '../templates/profileChangeTemplates';
import {
  getCommunicationEmailHtml,
  CommunicationEmailParams
} from '../templates/communicationTemplates';

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
    const error = 'Email configuration incomplete — SMTP transporter could not be initialized';
    log.error(error);
    return { success: false, error };
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
    const reason = error?.message || String(error);
    log.error({ err: error, to }, 'SMTP send failed');
    return { success: false, error: reason };
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

// ─── Auth / credentials email helpers ─────────────────────────────────────────
// Sent directly via SMTP (Brevo) instead of Keycloak's own required-actions
// email, which depends on the realm's SMTP config being set up separately.

export const sendWelcomeCredentialsEmail = async (email: string, params: AuthEmailParams) => {
  const html = getWelcomeCredentialsEmailHtml(params);
  return sendHtmlEmail(email, 'Welcome to OXO Carriers - Account Credentials', html, `Your temporary password: ${params.password}`);
};

export const sendPasswordResetCredentialsEmail = async (email: string, params: AuthEmailParams) => {
  const html = getPasswordResetCredentialsEmailHtml(params);
  return sendHtmlEmail(email, 'Password Reset - OXO Carriers', html, `Your temporary password: ${params.password}`);
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

// ─── Profile change request email helpers ─────────────────────────────────────

export const sendProfileChangeSubmittedEmail = async (email: string, params: ProfileChangeEmailParams) => {
  const html = getProfileChangeSubmittedEmailHtml(params);
  const subject = `Profile Change Request Submitted - ${params.referenceNumber}`;
  return sendHtmlEmail(email, subject, html);
};

export const sendProfileChangeApprovedEmail = async (email: string, params: ProfileChangeEmailParams) => {
  const html = getProfileChangeApprovedEmailHtml(params);
  const subject = `Profile Change Request Approved - ${params.referenceNumber}`;
  return sendHtmlEmail(email, subject, html);
};

export const sendProfileChangeRejectedEmail = async (email: string, params: ProfileChangeEmailParams) => {
  const html = getProfileChangeRejectedEmailHtml(params);
  const subject = `Profile Change Request Rejected - ${params.referenceNumber}`;
  return sendHtmlEmail(email, subject, html);
};

export const sendProfileChangeReturnedEmail = async (email: string, params: ProfileChangeEmailParams) => {
  const html = getProfileChangeReturnedEmailHtml(params);
  const subject = `Profile Change Request Returned for Modification - ${params.referenceNumber}`;
  return sendHtmlEmail(email, subject, html);
};

// ─── Employee communication email helpers ─────────────────────────────────────

export const sendCommunicationEmail = async (email: string, params: CommunicationEmailParams) => {
  const html = getCommunicationEmailHtml(params);
  return sendHtmlEmail(email, params.title, html);
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
