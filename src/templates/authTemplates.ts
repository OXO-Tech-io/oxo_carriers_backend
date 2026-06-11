import { renderMasterLayout, renderDetailsTable, DetailsRow } from './masterLayout';

export interface AuthEmailParams {
  name: string;
  employeeId?: string;
  setupLink?: string;
  resetLink?: string;
  verificationLink?: string;
  password?: string;
  loginUrl?: string;
  button_text?: string;
  expiry?: string;
  message_body?: string;
}

/**
 * 1. Set Up Your Password Onboarding Email
 */
export const getSetupPasswordEmailHtml = (params: AuthEmailParams): string => {
  const details: DetailsRow[] = [];
  if (params.employeeId) {
    details.push({ label: 'Employee ID', value: params.employeeId });
  }
  details.push({ label: 'Link Expiry', value: params.expiry || '7 days' });

  return renderMasterLayout({
    subject: 'Set Up Your Password - OXO Carriers',
    preheader: 'Welcome to OXO Carriers! Please set up your password to activate your account.',
    heroIcon: 'info',
    statusBadgeText: 'ACCOUNT ONBOARDING',
    statusBadgeType: 'neutral',
    title: 'Account Onboarding',
    messageHtml: `<p style="margin:0;">Hello ${params.name || 'User'},</p><p style="margin:12px 0 0 0;">${params.message_body || 'We are excited to have you on board! To get started, please use the button below to set up your secure account password and access the OXO Carriers employee portal.'}</p>`,
    detailsTableHtml: details.length > 0 ? renderDetailsTable(details) : '',
    ctaText: params.button_text || 'Complete Password Setup',
    ctaLink: params.setupLink || '#',
  });
};

/**
 * 2. Password Reset Request Email
 */
export const getPasswordResetEmailHtml = (params: AuthEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Request Type', value: 'Password Reset' },
    { label: 'Link Expiry', value: params.expiry || '1 hour' },
  ];

  return renderMasterLayout({
    subject: 'Password Reset Request - OXO Carriers',
    preheader: 'Did you request a password reset? If so, follow the link inside.',
    heroIcon: 'warning',
    statusBadgeText: 'SECURITY REQUEST',
    statusBadgeType: 'warning',
    title: 'Password Reset Request',
    messageHtml: `<p style="margin:0;">Hello ${params.name || 'User'},</p><p style="margin:12px 0 0 0;">${params.message_body || 'We received a request to reset your password. If you did not make this request, you can safely ignore this email. Your current password will remain unchanged.'}</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: params.button_text || 'Reset My Password',
    ctaLink: params.resetLink || '#',
  });
};

/**
 * 3. Email Verification Email
 */
export const getEmailVerificationEmailHtml = (params: AuthEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Verification Type', value: 'Email Address Verification' },
    { label: 'Link Expiry', value: params.expiry || '24 hours' },
  ];

  return renderMasterLayout({
    subject: 'Verify Your Email Address - OXO Carriers',
    preheader: 'Please verify your email address to complete your account setup.',
    heroIcon: 'info',
    statusBadgeText: 'VERIFICATION',
    statusBadgeType: 'neutral',
    title: 'Verify Your Email',
    messageHtml: `<p style="margin:0;">Hello ${params.name || 'User'},</p><p style="margin:12px 0 0 0;">Thank you for registering. To verify your email address and activate your employee portal access, please click the button below:</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Verify Email Address',
    ctaLink: params.verificationLink || '#',
  });
};

/**
 * 4. Welcome / Credentials Email
 */
export const getWelcomeCredentialsEmailHtml = (params: AuthEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee ID', value: params.employeeId || 'N/A' },
    { label: 'Temporary Password', value: `<code style="font-family: monospace; background-color: #F1F5F9; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #1E293B;">${params.password || ''}</code>` },
  ];

  const extraHtml = `
    <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 4px; margin-top: 16px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px; text-align: left;">
          <h4 style="margin: 0 0 4px 0; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: bold; color: #92400E;">Security Warning</h4>
          <p style="margin: 0; font-family: 'Inter', sans-serif; font-size: 12px; color: #B45309; line-height: 1.5;">
            This is a temporary password. For security reasons, you will be prompted to change it immediately upon your first login. Do not share these credentials with anyone.
          </p>
        </td>
      </tr>
    </table>
  `;

  return renderMasterLayout({
    subject: 'Welcome to OXO Carriers - Account Credentials',
    preheader: 'Your account has been successfully created. View your login credentials inside.',
    heroIcon: 'success',
    statusBadgeText: 'WELCOME',
    statusBadgeType: 'success',
    title: 'Welcome to OXO Carriers',
    messageHtml: `<p style="margin:0;">Hello ${params.name || 'User'},</p><p style="margin:12px 0 0 0;">${params.message_body || 'Your account has been successfully created by HR. You can use the temporary credentials below to log in to the Employee Portal and access your profile, payslips, leaves, and other features.'}</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: params.button_text || 'Go to Login Portal',
    ctaLink: params.loginUrl || '#',
    extraHtml: extraHtml,
  });
};
