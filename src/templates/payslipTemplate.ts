import { renderMasterLayout, renderDetailsTable, DetailsRow } from './masterLayout';

export interface PayslipEmailParams {
  employeeName: string;
  payPeriod: string;
  netSalary: string;
  basicSalary?: string;
  allowances?: string;
  grossEarnings?: string;
  taxDeductions?: string;
  otherDeductions?: string;
  totalDeductions?: string;
  downloadUrl?: string;
}

/**
 * 7. Salary Payslip Available
 */
export const getPayslipAvailableHtml = (params: PayslipEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Pay Period', value: params.payPeriod },
    { label: 'Net Pay (Take-home)', value: `<strong style="color: #1E40AF; font-size: 16px;">${params.netSalary}</strong>` },
  ];

  // Financial summary breakdown (Earnings vs Deductions) in clean HTML tables
  const extraHtml = `
    <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="margin-top: 16px; margin-bottom: 24px;">
      <tr>
        <td style="vertical-align: top; padding-bottom: 16px;">
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; border-collapse: separate;">
            <tr>
              <td colspan="2" style="background-color: #F1F5F9; border-top-left-radius: 8px; border-top-right-radius: 8px; padding: 10px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; color: #1E293B; text-align: left;">
                EARNINGS SUMMARY
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; color: #64748B; text-align: left;">Basic Pay</td>
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: #1E293B; text-align: right;">${params.basicSalary || 'Not specified'}</td>
            </tr>
            <tr style="border-top: 1px solid #F1F5F9;">
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; color: #64748B; text-align: left;">Allowances</td>
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: #1E293B; text-align: right;">${params.allowances || 'Not specified'}</td>
            </tr>
            <tr style="border-top: 1px solid #E2E8F0; background-color: #F1F5F9;">
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; color: #1E293B; text-align: left; border-bottom-left-radius: 8px;">Gross Earnings</td>
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; color: #1E293B; text-align: right; border-bottom-right-radius: 8px;">${params.grossEarnings || 'Not specified'}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="vertical-align: top;">
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; border-collapse: separate;">
            <tr>
              <td colspan="2" style="background-color: #F1F5F9; border-top-left-radius: 8px; border-top-right-radius: 8px; padding: 10px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; color: #1E293B; text-align: left;">
                DEDUCTIONS SUMMARY
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; color: #64748B; text-align: left;">Income Tax (PAYE)</td>
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: #991B1B; text-align: right;">${params.taxDeductions || 'Not specified'}</td>
            </tr>
            <tr style="border-top: 1px solid #F1F5F9;">
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; color: #64748B; text-align: left;">Other Deductions</td>
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: #991B1B; text-align: right;">${params.otherDeductions || 'Not specified'}</td>
            </tr>
            <tr style="border-top: 1px solid #E2E8F0; background-color: #F1F5F9;">
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; color: #1E293B; text-align: left; border-bottom-left-radius: 8px;">Total Deductions</td>
              <td style="padding: 12px 16px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; color: #991B1B; text-align: right; border-bottom-right-radius: 8px;">${params.totalDeductions || 'Not specified'}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return renderMasterLayout({
    subject: `Payslip Available for Pay Period ${params.payPeriod}`,
    preheader: `Your monthly payslip for ${params.payPeriod} is now ready for download. Net Pay: ${params.netSalary}.`,
    heroIcon: 'info',
    statusBadgeText: 'PAYSLIP AVAILABLE',
    statusBadgeType: 'success',
    title: 'Salary Payslip Available',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">Your monthly salary payslip for the pay period <strong>${params.payPeriod}</strong> has been issued. Below is a high-level summary of your gross earnings, deductions, and final net payout. You can view or download the complete detailed PDF payslip via the button below.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Download Payslip PDF',
    ctaLink: params.downloadUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/salaries',
    extraHtml: extraHtml,
  });
};
