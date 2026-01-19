import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Gmail SMTP Configuration
const isEmailConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter: nodemailer.Transporter | null = null;

if (isEmailConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // Use Gmail App Password here
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Verify transporter configuration (async, don't block startup)
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email transporter verification failed:', error.message);
      console.error('   Please check your SMTP credentials in .env file');
      console.error('   See backend/EMAIL_SETUP.md for setup instructions');
    } else {
      console.log('✅ Email server is ready to send messages');
    }
  });
} else {
  console.warn('⚠️  Email not configured: SMTP_USER and/or SMTP_PASS not set in .env');
  console.warn('   Email functionality will be disabled. See backend/EMAIL_SETUP.md for setup instructions');
}

export const sendEmail = async (to: string, subject: string, html: string) => {
  if (!transporter || !isEmailConfigured) {
    console.warn(`⚠️  Email not sent to ${to}: Email service not configured`);
    console.warn('   Set SMTP_USER and SMTP_PASS in .env to enable email functionality');
    return null;
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent successfully to ${to}`);
    return info;
  } catch (error: any) {
    console.error(`❌ Email sending failed to ${to}:`, error.message);
    // Don't throw error - allow application to continue even if email fails
    return null;
  }
};

export const sendEmployeeCredentials = async (
  email: string,
  employeeId: string,
  password: string,
  firstName: string
) => {
  const subject = 'Welcome to HRIS Payroll System - Your Login Credentials';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .credentials { background-color: white; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to HRIS Payroll System</h1>
        </div>
        <div class="content">
          <p>Dear ${firstName},</p>
          <p>Your account has been created in the HRIS Payroll System. Please find your login credentials below:</p>
          <div class="credentials">
            <p><strong>Employee ID:</strong> ${employeeId}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> ${password}</p>
          </div>
          <div class="warning">
            <p><strong>⚠️ Important:</strong> You will be required to change your password on first login for security purposes.</p>
          </div>
          <p>Please log in at: <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login">${process.env.FRONTEND_URL || 'http://localhost:3000'}/login</a></p>
          <p>If you have any questions, please contact HR.</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

export const sendPasswordSetupEmail = async (email: string, setupToken: string, firstName: string, employeeId: string) => {
  const subject = 'Welcome to HRIS Payroll System - Set Up Your Password';
  const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${setupToken}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #465FFF 0%, #3641F5 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .content { padding: 30px 20px; background-color: #ffffff; }
        .info-box { background-color: #ECF3FF; border-left: 4px solid #465FFF; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #465FFF 0%, #3641F5 100%); color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; box-shadow: 0 4px 6px rgba(70, 95, 255, 0.3); }
        .button:hover { box-shadow: 0 6px 8px rgba(70, 95, 255, 0.4); }
        .link-box { background-color: #F9FAFB; border: 1px solid #E4E7EC; padding: 15px; margin: 20px 0; border-radius: 4px; word-break: break-all; }
        .footer { text-align: center; padding: 20px; color: #98A2B3; font-size: 12px; background-color: #F9FAFB; }
        .warning { background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to HRIS Payroll System</h1>
        </div>
        <div class="content">
          <p>Dear ${firstName},</p>
          <p>Your account has been created in the HRIS Payroll System. To get started, please set up your password by clicking the button below:</p>
          
          <div class="info-box">
            <p style="margin: 0;"><strong>Employee ID:</strong> ${employeeId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Email:</strong> ${email}</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${setupLink}" class="button">Set Up Your Password</a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <div class="link-box">
            <p style="margin: 0; font-size: 12px; color: #475467;">${setupLink}</p>
          </div>

          <div class="warning">
            <p style="margin: 0;"><strong>⚠️ Important:</strong> This link will expire in 7 days. Please set up your password as soon as possible.</p>
          </div>

          <p>If you did not expect this email, please contact your HR department.</p>
        </div>
        <div class="footer">
          <p>This is an automated email from HRIS Payroll System. Please do not reply to this email.</p>
          <p>If you need assistance, please contact your HR department.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

export const sendPasswordResetEmail = async (email: string, resetToken: string, firstName: string) => {
  const subject = 'Password Reset Request - HRIS Payroll System';
  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #465FFF 0%, #3641F5 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .content { padding: 30px 20px; background-color: #ffffff; }
        .button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #465FFF 0%, #3641F5 100%); color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; box-shadow: 0 4px 6px rgba(70, 95, 255, 0.3); }
        .button:hover { box-shadow: 0 6px 8px rgba(70, 95, 255, 0.4); }
        .link-box { background-color: #F9FAFB; border: 1px solid #E4E7EC; padding: 15px; margin: 20px 0; border-radius: 4px; word-break: break-all; }
        .footer { text-align: center; padding: 20px; color: #98A2B3; font-size: 12px; background-color: #F9FAFB; }
        .warning { background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Dear ${firstName},</p>
          <p>You have requested to reset your password. Click the button below to create a new password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" class="button">Reset Password</a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <div class="link-box">
            <p style="margin: 0; font-size: 12px; color: #475467;">${resetLink}</p>
          </div>

          <div class="warning">
            <p style="margin: 0;"><strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you did not request this password reset, please ignore this email and contact your HR department immediately.</p>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated email from HRIS Payroll System. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

export const sendEmailVerificationEmail = async (email: string, verificationToken: string, firstName: string) => {
  const subject = 'Verify Your Email - HRIS Payroll System';
  const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .content { padding: 30px 20px; background-color: #ffffff; }
        .button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3); }
        .button:hover { box-shadow: 0 6px 8px rgba(16, 185, 129, 0.4); }
        .link-box { background-color: #F9FAFB; border: 1px solid #E4E7EC; padding: 15px; margin: 20px 0; border-radius: 4px; word-break: break-all; }
        .footer { text-align: center; padding: 20px; color: #98A2B3; font-size: 12px; background-color: #F9FAFB; }
        .info { background-color: #D1FADF; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Verify Your Email Address</h1>
        </div>
        <div class="content">
          <p>Dear ${firstName},</p>
          <p>Thank you for registering with HRIS Payroll System. Please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" class="button">Verify Email Address</a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <div class="link-box">
            <p style="margin: 0; font-size: 12px; color: #475467;">${verificationLink}</p>
          </div>

          <div class="info">
            <p style="margin: 0;"><strong>ℹ️ Note:</strong> This verification link will expire in 24 hours. If you did not create an account, please ignore this email.</p>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated email from HRIS Payroll System. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};
