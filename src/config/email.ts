import emailjs from '@emailjs/nodejs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

/**
 * EMAILJS TEMPLATE CONFIGURATION GUIDE
 * ------------------------------------
 * To use these templates, log in to your EmailJS Dashboard and create templates with the following:
 * 
 * 1. GENERAL SETTINGS (Required for all templates):
 *    - To Email: {{to_email}}
 *    - Subject: {{subject}} (to use the subject defined in code)
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

// Safe logging for production environments
const logToFile = (message: string) => {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    // Don't crash if folder creation is blocked by the server
    if (!fs.existsSync(logDir)) {
      try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
    }
    
    if (fs.existsSync(logDir)) {
      const logFile = path.join(logDir, 'email.log');
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    }
    console.log(`[Email] ${message}`);
  } catch (error) {
    console.log(`[Email-Log-Error] ${message}`);
  }
};

// Load environment variables
const loadEnvironmentVariables = () => {
  logToFile('Loading environment variables for EmailJS...');
  
  const possibleEnvPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];

  let envLoaded = false;
  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      envLoaded = true;
      logToFile(`Loaded .env from: ${envPath}`);
      break;
    }
  }

  if (!envLoaded) {
    dotenv.config();
  }

  // Log config (without sensitive info)
  logToFile(`EMAILJS_SERVICE_ID: ${process.env.EMAILJS_SERVICE_ID ? '***set***' : 'not set'}`);
  logToFile(`EMAILJS_PUBLIC_KEY: ${process.env.EMAILJS_PUBLIC_KEY ? '***set***' : 'not set'}`);
};

// Load environment variables
loadEnvironmentVariables();

// Main email sending function using EmailJS
export const sendEmail = async (
  to: string, 
  subject: string, 
  templateParams: any,
  templateId?: string
): Promise<any> => {
  const serviceId = process.env.EMAILJS_SERVICE_ID || '';
  
  // Decide which template ID to use
  let finalTemplateId = templateId;
  
  // If templateId is missing or looks like a placeholder, use fallbacks in order
  if (!finalTemplateId || 
      finalTemplateId.includes('xxxxxx') || 
      finalTemplateId.includes('yyyyyy') || 
      finalTemplateId.includes('zzzzzz') ||
      finalTemplateId === 'template_id_here') {
    
    // Priority fallbacks
    finalTemplateId = 
      process.env.EMAILJS_TEMPLATE_ID || 
      process.env.EMAILJS_WELCOME_TEMPLATE_ID || 
      process.env.EMAILJS_RESET_TEMPLATE_ID || 
      process.env.EMAILJS_VERIFY_TEMPLATE_ID || 
      '';
  }
  
  // Ensure EmailJS is initialized with latest keys (fixes issues with late-loading env)
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!publicKey || !privateKey || !serviceId || !finalTemplateId) {
    logToFile(`❌ EmailJS missing credentials: Public=${!!publicKey}, Private=${!!privateKey}, Service=${!!serviceId}, Template=${!!finalTemplateId}`);
    return null;
  }

  // Always re-init in production to ensures keys are valid
  emailjs.init({ publicKey, privateKey });

  logToFile(`Attempting to send EmailJS to: ${to}, subject: ${subject} using template: ${finalTemplateId}`);

  try {
    // 1. Clean the params: Strictly primitives, no hidden objects/prototypes
    const cleanTemplateParams = JSON.parse(JSON.stringify(templateParams));
    const sanitizedParams: any = {};
    for (const key in cleanTemplateParams) {
      const val = cleanTemplateParams[key];
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        sanitizedParams[key] = val;
      }
    }
    
    // 2. Build the final flat object for EmailJS
    const params: any = {
      // Recipient
      to_email: to,
      recipient_email: to,
      
      // User Data
      user_name: (cleanTemplateParams.firstName || cleanTemplateParams.name || 'User').toString(),
      user_id: (cleanTemplateParams.employeeId || '').toString(),
      user_pass: (cleanTemplateParams.password ? `Temporary Password: ${cleanTemplateParams.password}` : '').toString(),
      
      // Dynamic Content (Prepared in backend to avoid IF/ELSE in template)
      message_body: (cleanTemplateParams.message_body || 'Notification from HRIS System').toString(),
      button_text: (cleanTemplateParams.button_text || 'Click Here').toString(),
      action_link: (cleanTemplateParams.setupLink || cleanTemplateParams.resetLink || cleanTemplateParams.verificationLink || process.env.FRONTEND_URL || 'https://app.oxocareers.com').toString(),
      
      // Email Identifiers (Use this as {{email_subject}} in your template settings)
      email_subject: subject,
      subject: subject,
      expiry_info: (cleanTemplateParams.expiry ? `Note: This link expires in ${cleanTemplateParams.expiry}` : '').toString(),
      send_time: new Date().toLocaleString(),
      
      // Pass original values too as backup
      ...sanitizedParams
    };

    logToFile(`Sending EmailJS Template: ${finalTemplateId} to: ${to}`);
    
    // Explicitly pass credentials in options for maximum reliability
    const options = {
      publicKey: process.env.EMAILJS_PUBLIC_KEY,
      privateKey: process.env.EMAILJS_PRIVATE_KEY,
    };

    const result = await emailjs.send(serviceId, finalTemplateId, params, options);

    logToFile(`✅ Email sent successfully via EmailJS! Status: ${result.status}`);
    return {
      service: 'emailjs',
      response: result,
      status: result.status,
    };
  } catch (error: any) {
    const errorMsg = error.text || error.message || JSON.stringify(error);
    logToFile(`❌ EmailJS failed: ${errorMsg}`);
    
    // If it's a specific "template not found" error, maybe log a helpful hint
    if (errorMsg.includes('template') && errorMsg.includes('not found')) {
      logToFile('💡 HINT: Check if the Template ID in your .env matches the one in your EmailJS dashboard.');
    }
    
    return null;
  }
};

// Template functions refactored for EmailJS
export const sendEmployeeCredentials = async (
  email: string,
  employeeId: string,
  password: string,
  firstName: string
) => {
  const subject = 'Welcome to HRIS Payroll System - Your Login Credentials';
  const templateId = process.env.EMAILJS_WELCOME_TEMPLATE_ID;
  
  // You can design your EmailJS template to use these variables: {{firstName}}, {{employeeId}}, {{email}}, {{password}}, {{loginUrl}}
  const params = {
    firstName,
    employeeId,
    email,
    password,
    message_body: 'Your account for the HRIS Payroll System has been successfully created. Please use the temporary credentials below to access your portal.',
    button_text: 'Go to Login Portal',
    loginUrl: process.env.FRONTEND_URL || 'https://app.oxocareers.com'
  };

  return sendEmail(email, subject, params, templateId);
};

export const sendPasswordSetupEmail = async (
  email: string,
  setupToken: string,
  firstName: string,
  employeeId: string
) => {
  const subject = 'Set Up Your Password - HRIS Payroll System';
  const setupLink = `${process.env.FRONTEND_URL}/reset-password?token=${setupToken}`;
  const templateId = process.env.EMAILJS_WELCOME_TEMPLATE_ID;

  const params = {
    firstName,
    employeeId,
    setupLink,
    expiry: '7 days',
    message_body: 'We are excited to have you on board! To get started, please use the button below to set up your secure account password.',
    button_text: 'Complete Password Setup'
  };

  return sendEmail(email, subject, params, templateId);
};

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  firstName: string
) => {
  const subject = 'Password Reset - HRIS Payroll System';
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const templateId = process.env.EMAILJS_RESET_TEMPLATE_ID;

  const params = {
    firstName,
    resetLink,
    expiry: '1 hour',
    message_body: 'We received a request to reset your password. If you did not make this request, you can safely ignore this email.',
    button_text: 'Reset My Password'
  };

  return sendEmail(email, subject, params, templateId);
};

export const sendEmailVerificationEmail = async (
  email: string,
  verificationToken: string,
  firstName: string
) => {
  const subject = 'Verify Your Email Address - HRIS Payroll System';
  const frontendUrl = process.env.FRONTEND_URL || 'https://app.oxocareers.com';
  const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
  const templateId = process.env.EMAILJS_VERIFY_TEMPLATE_ID;
  
  const params = {
    firstName,
    verificationLink,
    expiry: '24 hours'
  };

  return sendEmail(email, subject, params, templateId);
};

// Test email function
export const sendTestEmail = async (to: string = ''): Promise<{success: boolean, message: string, details?: any}> => {
  const testEmail = to || 'info@oxocareers.com';
  const subject = 'Test Email from HRIS System (EmailJS)';
  
  const params = {
    message: 'This is a test email to verify your EmailJS integration.',
    timestamp: new Date().toISOString()
  };

  try {
    const result = await sendEmail(testEmail, subject, params);
    
    if (result) {
      return {
        success: true,
        message: `Test email sent successfully via EmailJS`,
        details: result
      };
    } else {
      return {
        success: false,
        message: 'Failed to send test email via EmailJS. Check logs.'
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Error sending test email: ${error.message}`
    };
  }
};

export const getEmailServiceStatus = () => {
  const ready = !!(process.env.EMAILJS_PUBLIC_KEY && process.env.EMAILJS_PRIVATE_KEY && process.env.EMAILJS_SERVICE_ID);
  return {
    emailJS: {
      ready: ready,
      serviceId: process.env.EMAILJS_SERVICE_ID,
      templateId: process.env.EMAILJS_TEMPLATE_ID,
      publicKeySet: !!process.env.EMAILJS_PUBLIC_KEY,
      privateKeySet: !!process.env.EMAILJS_PRIVATE_KEY,
    },
    overall: ready,
  };
};

// Periodic check on startup
(async () => {
  const status = getEmailServiceStatus();
  logToFile(`System Startup - Email Status: ${status.overall ? '✅ READY' : '❌ NOT READY'}`);
})();

export const verifyEmailConfigOnStartup = async () => {
  return !!(process.env.EMAILJS_PUBLIC_KEY && process.env.EMAILJS_PRIVATE_KEY);
};