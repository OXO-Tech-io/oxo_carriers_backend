import { renderMasterLayout, renderDetailsTable, DetailsRow } from './masterLayout';

export interface LeaveEmailParams {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: string | number;
  reason?: string;
  submittedDate?: string;
  referenceNumber: string;
  approvedDate?: string;
  approvedBy?: string;
  remainingBalance?: string | number;
  rejectionReason?: string;
  ctaUrl?: string;
}

/**
 * 1. Leave Request Submitted Email
 */
export const getLeaveSubmittedEmailHtml = (params: LeaveEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Leave Type', value: params.leaveType },
    { label: 'Start Date', value: params.startDate },
    { label: 'End Date', value: params.endDate },
    { label: 'Total Days', value: `${params.totalDays} Day(s)` },
    { label: 'Reason', value: params.reason || 'Not specified' },
    { label: 'Submitted Date', value: params.submittedDate || new Date().toLocaleDateString() },
    { label: 'Reference Number', value: params.referenceNumber },
  ];

  return renderMasterLayout({
    subject: `Leave Request Submitted - ${params.referenceNumber}`,
    preheader: `Your leave request for ${params.leaveType} has been submitted successfully.`,
    heroIcon: 'info',
    statusBadgeText: 'PENDING APPROVAL',
    statusBadgeType: 'warning',
    title: 'Leave Request Submitted',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">Your leave request has been submitted successfully. It is currently pending review by your manager. You can track the status of this request or cancel it in the Employee Self Service Portal.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View Request Status',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/leaves',
  });
};

/**
 * 2. Leave Approved Email
 */
export const getLeaveApprovedEmailHtml = (params: LeaveEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Leave Type', value: params.leaveType },
    { label: 'Start Date', value: params.startDate },
    { label: 'End Date', value: params.endDate },
    { label: 'Total Days', value: `${params.totalDays} Day(s)` },
    { label: 'Approval Date', value: params.approvedDate || new Date().toLocaleDateString() },
    { label: 'Approved By', value: params.approvedBy || 'HR Management' },
    { label: 'Remaining Balance', value: params.remainingBalance ? `${params.remainingBalance} Day(s)` : 'Not specified' },
  ];

  return renderMasterLayout({
    subject: `Leave Request Approved - ${params.referenceNumber}`,
    preheader: `Your leave request has been approved. Enjoy your time off!`,
    heroIcon: 'success',
    statusBadgeText: 'APPROVED',
    statusBadgeType: 'success',
    title: 'Leave Request Approved',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">Your leave request has been approved. Your status has been updated in the HR system, and your calendar will reflect these dates. Enjoy your time off!</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View Approved Leave',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/leaves',
  });
};

/**
 * 3. Leave Rejected Email
 */
export const getLeaveRejectedEmailHtml = (params: LeaveEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Leave Type', value: params.leaveType },
    { label: 'Start Date', value: params.startDate },
    { label: 'End Date', value: params.endDate },
    { label: 'Total Days', value: `${params.totalDays} Day(s)` },
    { label: 'Rejection Reason', value: params.rejectionReason || 'No reason provided by manager.' },
  ];

  const extraHtml = `
    <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FDF2F2; border-left: 4px solid #DC2626; border-radius: 4px; margin-top: 16px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px; text-align: left;">
          <h4 style="margin: 0 0 8px 0; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: bold; color: #9B1C1C;">Next Steps</h4>
          <ul style="margin: 0; padding-left: 20px; font-family: 'Inter', sans-serif; font-size: 13px; color: #7F1D1D; line-height: 1.5;">
            <li>Review the rejection reason above for context on the decision.</li>
            <li>Consult with your team leader or manager regarding alternative scheduling options.</li>
            <li>Submit a new leave request with updated dates via the Self Service Portal.</li>
          </ul>
        </td>
      </tr>
    </table>
  `;

  return renderMasterLayout({
    subject: `Leave Request Declined - ${params.referenceNumber}`,
    preheader: `Your leave request has been declined. Please review details.`,
    heroIcon: 'danger',
    statusBadgeText: 'DECLINED',
    statusBadgeType: 'danger',
    title: 'Leave Request Declined',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">We regret to inform you that your leave request has been declined by your manager or HR department. Please review the details and next steps below.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Go to Leave Portal',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/leaves',
    extraHtml: extraHtml,
  });
};
