import { renderMasterLayout, renderDetailsTable, DetailsRow } from './masterLayout';

export interface ProfileChangeEmailParams {
  employeeName: string;
  referenceNumber: string;
  submittedDate?: string;
  decidedDate?: string;
  reviewerComments?: string;
  changesSummary: string[];
  ctaUrl?: string;
}

const FRONTEND_FALLBACK_PROFILE_URL =
  'https://oxo-carriers-frontend-297614602590.us-central1.run.app/profile?tab=pending-changes';
const FRONTEND_FALLBACK_APPROVALS_URL =
  'https://oxo-carriers-frontend-297614602590.us-central1.run.app/profile-approvals';

/**
 * 1. Profile Change Request Submitted Email (sent to HR)
 */
export const getProfileChangeSubmittedEmailHtml = (params: ProfileChangeEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Changes Requested', value: params.changesSummary.join(', ') },
    { label: 'Submitted Date', value: params.submittedDate || new Date().toLocaleDateString() },
    { label: 'Reference Number', value: params.referenceNumber },
  ];

  return renderMasterLayout({
    subject: `Profile Change Request Submitted - ${params.referenceNumber}`,
    preheader: `${params.employeeName} submitted a profile change request awaiting your review.`,
    heroIcon: 'info',
    statusBadgeText: 'PENDING APPROVAL',
    statusBadgeType: 'warning',
    title: 'Profile Change Request Submitted',
    messageHtml: `<p style="margin:0;">Hello,</p><p style="margin:12px 0 0 0;">${params.employeeName} has submitted a profile change request that requires your review. Please review the requested changes in the HR Profile Approvals screen.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Review Request',
    ctaLink: params.ctaUrl || FRONTEND_FALLBACK_APPROVALS_URL,
  });
};

/**
 * 2. Profile Change Request Approved Email (sent to employee)
 */
export const getProfileChangeApprovedEmailHtml = (params: ProfileChangeEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Changes Applied', value: params.changesSummary.join(', ') },
    { label: 'Decision Date', value: params.decidedDate || new Date().toLocaleDateString() },
    { label: 'Reference Number', value: params.referenceNumber },
  ];

  return renderMasterLayout({
    subject: `Profile Change Request Approved - ${params.referenceNumber}`,
    preheader: `Your profile change request has been approved.`,
    heroIcon: 'success',
    statusBadgeText: 'APPROVED',
    statusBadgeType: 'success',
    title: 'Profile Change Request Approved',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">Your profile change request has been approved and your profile has been updated accordingly.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View My Profile',
    ctaLink: params.ctaUrl || FRONTEND_FALLBACK_PROFILE_URL,
  });
};

/**
 * 3. Profile Change Request Rejected Email (sent to employee)
 */
export const getProfileChangeRejectedEmailHtml = (params: ProfileChangeEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Changes Requested', value: params.changesSummary.join(', ') },
    { label: 'Reviewer Comments', value: params.reviewerComments || 'No reason provided.' },
    { label: 'Reference Number', value: params.referenceNumber },
  ];

  return renderMasterLayout({
    subject: `Profile Change Request Rejected - ${params.referenceNumber}`,
    preheader: `Your profile change request has been rejected. Please review details.`,
    heroIcon: 'danger',
    statusBadgeText: 'REJECTED',
    statusBadgeType: 'danger',
    title: 'Profile Change Request Rejected',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">We regret to inform you that your profile change request has been rejected by HR. Please review the reviewer comments below.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View My Profile',
    ctaLink: params.ctaUrl || FRONTEND_FALLBACK_PROFILE_URL,
  });
};

/**
 * 4. Profile Change Request Returned for Modification Email (sent to employee)
 */
export const getProfileChangeReturnedEmailHtml = (params: ProfileChangeEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Employee Name', value: params.employeeName },
    { label: 'Changes Requested', value: params.changesSummary.join(', ') },
    { label: 'Reviewer Comments', value: params.reviewerComments || 'No comments provided.' },
    { label: 'Reference Number', value: params.referenceNumber },
  ];

  return renderMasterLayout({
    subject: `Profile Change Request Returned for Modification - ${params.referenceNumber}`,
    preheader: `HR has requested modifications to your profile change request.`,
    heroIcon: 'warning',
    statusBadgeText: 'RETURNED',
    statusBadgeType: 'warning',
    title: 'Profile Change Request Returned for Modification',
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">HR has reviewed your profile change request and requested modifications. Please review the comments below and resubmit your request.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View My Profile',
    ctaLink: params.ctaUrl || FRONTEND_FALLBACK_PROFILE_URL,
  });
};
