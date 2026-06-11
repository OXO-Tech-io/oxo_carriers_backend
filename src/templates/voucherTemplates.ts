import { renderMasterLayout, renderDetailsTable, DetailsRow } from './masterLayout';

export interface VoucherEmailParams {
  employeeName: string;
  voucherNumber?: string;
  voucherType: string;
  approvedAmount?: string | number;
  requestedAmount?: string | number;
  expiryDate?: string;
  rejectionReason?: string;
  resubmissionInstructions?: string;
  ctaUrl?: string;
}

/**
 * 8. Voucher Approved Email
 */
export const getVoucherApprovedHtml = (params: VoucherEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Voucher Number', value: params.voucherNumber || 'VCH-NEW-CLAIM' },
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Voucher Type', value: params.voucherType },
    { label: 'Approved Amount', value: String(params.approvedAmount || 'Not specified') },
    { label: 'Expiry Date', value: params.expiryDate || 'N/A' },
  ];

  return renderMasterLayout({
    subject: `Voucher Approved - ${params.voucherNumber || ''}`,
    preheader: `Good news! Your voucher claim for ${params.approvedAmount} has been approved.`,
    heroIcon: 'success',
    statusBadgeText: 'VOUCHER APPROVED',
    statusBadgeType: 'success',
    title: 'Voucher Approved',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">Your voucher request has been approved. You can view the voucher code, bar code, or activation link in your employee self-service portal to redeem it.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Redeem Voucher',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/vouchers',
  });
};

/**
 * 9. Voucher Rejected Email
 */
export const getVoucherRejectedHtml = (params: VoucherEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Voucher Type', value: params.voucherType },
    { label: 'Requested Amount', value: String(params.requestedAmount || 'Not specified') },
    { label: 'Rejection Reason', value: params.rejectionReason || 'Voucher criteria not met.' },
  ];

  const extraHtml = `
    <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FDF2F2; border-left: 4px solid #DC2626; border-radius: 4px; margin-top: 16px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px; text-align: left;">
          <h4 style="margin: 0 0 8px 0; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: bold; color: #9B1C1C;">Resubmission Instructions</h4>
          <p style="margin: 0; font-family: 'Inter', sans-serif; font-size: 13px; color: #7F1D1D; line-height: 1.5;">
            ${params.resubmissionInstructions || 'Please check your category quotas and eligibility. If you believe this was in error, please submit a new voucher request in the portal with supporting documentation, or contact your supervisor.'}
          </p>
        </td>
      </tr>
    </table>
  `;

  return renderMasterLayout({
    subject: `Voucher Request Rejected`,
    preheader: `Your voucher request for ${params.voucherType} was rejected. Details inside.`,
    heroIcon: 'danger',
    statusBadgeText: 'VOUCHER REJECTED',
    statusBadgeType: 'danger',
    title: 'Voucher Request Rejected',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">We regret to inform you that your voucher request has been declined. Please review the details below.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Request Support',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/vouchers',
    extraHtml: extraHtml,
  });
};
