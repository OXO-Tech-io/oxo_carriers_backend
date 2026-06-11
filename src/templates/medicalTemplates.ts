import { renderMasterLayout, renderDetailsTable, DetailsRow } from './masterLayout';

export interface MedicalEmailParams {
  employeeName: string;
  claimId: string;
  claimType: string;
  claimAmount: string | number;
  approvedAmount?: string | number;
  submissionDate?: string;
  approvalDate?: string;
  settlementInfo?: string;
  processingTimeline?: string;
  rejectionReason?: string;
  requiredCorrections?: string;
  ctaUrl?: string;
}

/**
 * 4. Medical Insurance Claim Submitted
 */
export const getMedicalClaimSubmittedHtml = (params: MedicalEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Claim ID', value: params.claimId },
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Claim Type', value: params.claimType },
    { label: 'Claim Amount', value: String(params.claimAmount) },
    { label: 'Submission Date', value: params.submissionDate || new Date().toLocaleDateString() },
    { label: 'Claim Status', value: 'Under Review' },
  ];

  return renderMasterLayout({
    subject: `Medical Claim Submitted - ${params.claimId}`,
    preheader: `Your medical claim for ${params.claimAmount} has been received and is under review.`,
    heroIcon: 'info',
    statusBadgeText: 'UNDER REVIEW',
    statusBadgeType: 'warning',
    title: 'Medical Claim Submitted',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">We have received your medical insurance claim. Our benefits team is reviewing the claim against your policy coverage. You can track updates and view upload history in the portal.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Track Claim Status',
    ctaLink: params.ctaUrl || 'https://app.oxocareers.com/medical-claims',
  });
};

/**
 * 5. Medical Insurance Claim Approved
 */
export const getMedicalClaimApprovedHtml = (params: MedicalEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Claim ID', value: params.claimId },
    { label: 'Claim Type', value: params.claimType },
    { label: 'Claim Amount', value: String(params.claimAmount) },
    { label: 'Approved Amount', value: String(params.approvedAmount || params.claimAmount) },
    { label: 'Approval Date', value: params.approvalDate || new Date().toLocaleDateString() },
    { label: 'Settlement Info', value: params.settlementInfo || 'Bank Direct Deposit' },
    { label: 'Processing Timeline', value: params.processingTimeline || '2-4 Business Days' },
  ];

  return renderMasterLayout({
    subject: `Medical Claim Approved - ${params.claimId}`,
    preheader: `Good news! Your medical insurance claim has been approved.`,
    heroIcon: 'success',
    statusBadgeText: 'CLAIM APPROVED',
    statusBadgeType: 'success',
    title: 'Medical Claim Approved',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">Your medical insurance claim has been approved. The approved reimbursement has been queued for payout according to the settlement details below.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View Claim Details',
    ctaLink: params.ctaUrl || 'https://app.oxocareers.com/medical-claims',
  });
};

/**
 * 6. Medical Insurance Claim Rejected
 */
export const getMedicalClaimRejectedHtml = (params: MedicalEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Claim ID', value: params.claimId },
    { label: 'Claim Type', value: params.claimType },
    { label: 'Claim Amount', value: String(params.claimAmount) },
    { label: 'Rejection Reason', value: params.rejectionReason || 'Receipt invalid or not itemized.' },
    { label: 'Required Action', value: params.requiredCorrections || 'Provide itemized service breakdown.' },
  ];

  const extraHtml = `
    <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FDF2F2; border-left: 4px solid #DC2626; border-radius: 4px; margin-top: 16px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px; text-align: left;">
          <h4 style="margin: 0 0 8px 0; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: bold; color: #9B1C1C;">Resubmission Instructions</h4>
          <ol style="margin: 0; padding-left: 20px; font-family: 'Inter', sans-serif; font-size: 13px; color: #7F1D1D; line-height: 1.5;">
            <li>Log in to your <strong>OXO Carriers</strong> account.</li>
            <li>Go to <strong>Medical Insurance Claims</strong> and locate the rejected claim.</li>
            <li>Click <strong>Edit/Resubmit</strong> to upload the corrected documents.</li>
            <li>Ensure files are clear, high resolution, and list the provider, patient name, procedure codes, and date of service.</li>
          </ol>
        </td>
      </tr>
    </table>
  `;

  return renderMasterLayout({
    subject: `Medical Claim Rejected - ${params.claimId}`,
    preheader: `Attention needed: Your medical insurance claim has been rejected.`,
    heroIcon: 'danger',
    statusBadgeText: 'CLAIM REJECTED',
    statusBadgeType: 'danger',
    title: 'Medical Claim Rejected',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">We regret to inform you that your medical insurance claim could not be processed as submitted. Please see the rejection details and resubmission instructions below to correct the issue.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Resubmit Claim',
    ctaLink: params.ctaUrl || 'https://app.oxocareers.com/medical-claims',
    extraHtml: extraHtml,
  });
};
