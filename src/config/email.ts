import emailjs from '@emailjs/nodejs';
import { env } from './env';
import { logger as baseLogger } from '../lib/logger';

const log = baseLogger.child({ module: 'email' });

/**
 * EMAILJS TEMPLATE CONFIGURATION GUIDE
 * ------------------------------------
 * To use these templates, log in to your EmailJS Dashboard and create
 * templates with the following:
 *
 * 1. GENERAL SETTINGS (Required for all templates):
 *    - To Email: {{to_email}}
 *    - Subject: {{subject}}
 *
 * 2. WELCOME / CREDENTIALS TEMPLATE (EMAILJS_WELCOME_TEMPLATE_ID):
 *    Variables: {{firstName}}, {{employeeId}}, {{email}}, {{password}}, {{loginUrl}}
 *
 * 3. PASSWORD RESET / SETUP TEMPLATE (EMAILJS_RESET_TEMPLATE_ID):
 *    Variables: {{firstName}}, {{setupLink}}, {{resetLink}}, {{expiry}}, {{employeeId}}
 *
 * 4. EMAIL VERIFICATION TEMPLATE (EMAILJS_VERIFY_TEMPLATE_ID):
 *    Variables: {{firstName}}, {{verificationLink}}, {{expiry}}
 *
 * 5. TEST TEMPLATE (EMAILJS_TEMPLATE_ID):
 *    Variables: {{message}}, {{timestamp}}
 */

const FRONTEND_FALLBACK = 'https://app.oxocareers.com';

const isPlaceholderTemplate = (id: string | undefined): boolean =>
  !id ||
  id.includes('xxxxxx') ||
  id.includes('yyyyyy') ||
  id.includes('zzzzzz') ||
  id === 'template_id_here';

// Main email sending function using EmailJS
export const sendEmail = async (
  to: string,
  subject: string,
  templateParams: any,
  templateId?: string,
): Promise<any> => {
  const serviceId = env.EMAILJS_SERVICE_ID ?? '';

  // Decide which template ID to use
  let finalTemplateId = templateId;
  if (isPlaceholderTemplate(finalTemplateId)) {
    finalTemplateId =
      env.EMAILJS_TEMPLATE_ID ??
      env.EMAILJS_WELCOME_TEMPLATE_ID ??
      env.EMAILJS_RESET_TEMPLATE_ID ??
      env.EMAILJS_VERIFY_TEMPLATE_ID ??
      '';
  }

  const publicKey = env.EMAILJS_PUBLIC_KEY;
  const privateKey = env.EMAILJS_PRIVATE_KEY;

  if (!publicKey || !privateKey || !serviceId || !finalTemplateId) {
    log.error(
      {
        hasPublicKey: !!publicKey,
        hasPrivateKey: !!privateKey,
        hasServiceId: !!serviceId,
        hasTemplateId: !!finalTemplateId,
      },
      'EmailJS missing credentials',
    );
    return null;
  }

  // Re-init each call so late-loaded env vars are picked up
  emailjs.init({ publicKey, privateKey });

  log.info(
    { to, subject, templateId: finalTemplateId },
    'Sending email via EmailJS',
  );

  try {
    // Strip non-primitive values
    const cleanTemplateParams = JSON.parse(JSON.stringify(templateParams));
    const sanitizedParams: any = {};
    for (const key in cleanTemplateParams) {
      const val = cleanTemplateParams[key];
      if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean'
      ) {
        sanitizedParams[key] = val;
      }
    }

    const params: any = {
      to_email: to,
      recipient_email: to,
      user_name: (
        cleanTemplateParams.firstName ||
        cleanTemplateParams.name ||
        'User'
      ).toString(),
      user_id: (cleanTemplateParams.employeeId || '').toString(),
      user_pass: (cleanTemplateParams.password
        ? `Temporary Password: ${cleanTemplateParams.password}`
        : ''
      ).toString(),
      message_body: (
        cleanTemplateParams.message_body || 'Notification from HRIS System'
      ).toString(),
      button_text: (
        cleanTemplateParams.button_text || 'Click Here'
      ).toString(),
      action_link: (
        cleanTemplateParams.setupLink ||
        cleanTemplateParams.resetLink ||
        cleanTemplateParams.verificationLink ||
        env.FRONTEND_URL ||
        FRONTEND_FALLBACK
      ).toString(),
      email_subject: subject,
      subject: subject,
      expiry_info: (cleanTemplateParams.expiry
        ? `Note: This link expires in ${cleanTemplateParams.expiry}`
        : ''
      ).toString(),
      send_time: new Date().toLocaleString(),
      ...sanitizedParams,
    };

    const options = { publicKey, privateKey };
    const result = await emailjs.send(serviceId, finalTemplateId, params, options);

    log.info({ to, status: result.status }, 'Email sent via EmailJS');
    return {
      service: 'emailjs',
      response: result,
      status: result.status,
    };
  } catch (error: any) {
    const errorMsg = error.text || error.message || JSON.stringify(error);
    log.error({ err: error, to, templateId: finalTemplateId }, 'EmailJS send failed');

    if (errorMsg.includes('template') && errorMsg.includes('not found')) {
      log.warn(
        'Template ID may not match the one in your EmailJS dashboard',
      );
    }

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
  const templateId = env.EMAILJS_WELCOME_TEMPLATE_ID;

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

  return sendEmail(email, subject, params, templateId);
};

export const sendPasswordSetupEmail = async (
  email: string,
  setupToken: string,
  firstName: string,
  employeeId: string,
) => {
  const subject = 'Set Up Your Password - HRIS Payroll System';
  const setupLink = `${env.FRONTEND_URL ?? FRONTEND_FALLBACK}/reset-password?token=${setupToken}`;
  const templateId = env.EMAILJS_WELCOME_TEMPLATE_ID;

  const params = {
    firstName,
    employeeId,
    setupLink,
    expiry: '7 days',
    message_body:
      'We are excited to have you on board! To get started, please use the button below to set up your secure account password.',
    button_text: 'Complete Password Setup',
  };

  return sendEmail(email, subject, params, templateId);
};

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  firstName: string,
) => {
  const subject = 'Password Reset - HRIS Payroll System';
  const resetLink = `${env.FRONTEND_URL ?? FRONTEND_FALLBACK}/reset-password?token=${resetToken}`;
  const templateId = env.EMAILJS_RESET_TEMPLATE_ID;

  const params = {
    firstName,
    resetLink,
    expiry: '1 hour',
    message_body:
      'We received a request to reset your password. If you did not make this request, you can safely ignore this email.',
    button_text: 'Reset My Password',
  };

  return sendEmail(email, subject, params, templateId);
};

export const sendEmailVerificationEmail = async (
  email: string,
  verificationToken: string,
  firstName: string,
) => {
  const subject = 'Verify Your Email Address - HRIS Payroll System';
  const frontendUrl = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
  const templateId = env.EMAILJS_VERIFY_TEMPLATE_ID;

  const params = {
    firstName,
    verificationLink,
    expiry: '24 hours',
  };

  return sendEmail(email, subject, params, templateId);
};

export const sendTestEmail = async (
  to: string = '',
): Promise<{ success: boolean; message: string; details?: any }> => {
  const testEmail = to || 'info@oxocareers.com';
  const subject = 'Test Email from HRIS System (EmailJS)';

  const params = {
    message: 'This is a test email to verify your EmailJS integration.',
    timestamp: new Date().toISOString(),
  };

  try {
    const result = await sendEmail(testEmail, subject, params);

    if (result) {
      return {
        success: true,
        message: `Test email sent successfully via EmailJS`,
        details: result,
      };
    }
    return {
      success: false,
      message: 'Failed to send test email via EmailJS. Check logs.',
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
    env.EMAILJS_PUBLIC_KEY &&
    env.EMAILJS_PRIVATE_KEY &&
    env.EMAILJS_SERVICE_ID
  );
  return {
    emailJS: {
      ready,
      serviceId: env.EMAILJS_SERVICE_ID,
      templateId: env.EMAILJS_TEMPLATE_ID,
      publicKeySet: !!env.EMAILJS_PUBLIC_KEY,
      privateKeySet: !!env.EMAILJS_PRIVATE_KEY,
    },
    overall: ready,
  };
};

// Startup status report
(async () => {
  const status = getEmailServiceStatus();
  log.info(
    { ready: status.overall, serviceId: status.emailJS.serviceId ?? null },
    `Startup email status: ${status.overall ? 'ready' : 'not configured'}`,
  );
})();

export const verifyEmailConfigOnStartup = async () =>
  !!(env.EMAILJS_PUBLIC_KEY && env.EMAILJS_PRIVATE_KEY);
